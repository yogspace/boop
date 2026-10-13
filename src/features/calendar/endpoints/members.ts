import type { Endpoint, PayloadRequest } from "payload";
import { sessionAccount } from "@/features/accounts/session";
import { notifyInvited } from "@/features/push/invited";
import { unshare } from "@/features/sync/apply";
import { nudge, nudgeCalendars } from "@/features/sync/live";
import { rateLimit } from "@/lib/rate-limit";
import { invite } from "../invites";
import { calendarById } from "../membership";

/**
 * Sharing a calendar: its owner invites someone by their email address
 * (invites.ts) – nobody is in before saying yes – and removes members
 * again; a member can leave – any calendar, the last one too. The
 * calendar's `changedAt` moves on, so every member's devices learn of it at
 * the next sync.
 *
 * Whoever goes takes their stamps along: none of them stays shared with the
 * calendar (their prints on its days stay).
 *
 *   POST   /api/calendars/:id/members            { email }
 *   DELETE /api/calendars/:id/members/:accountId
 *
 * Inviting answers the same whatever the address is – an account's, none,
 * or a member's already: nobody finds out from here which addresses have
 * an account.
 */

// Each invitation sends a mail – a few dozen an hour per account, so
// nobody's inbox is filled from here.
const tooMany = rateLimit({ limit: 30, windowMs: 60 * 60 * 1000 });

/** `by`: who did it – the others hear of it (features/push). */
const touch = (
  req: PayloadRequest,
  id: string,
  members: string[],
  by: string
) =>
  req.payload.update({
    collection: "calendars",
    id,
    data: { members, changedAt: new Date().toISOString() },
    context: { sync: true, by },
    overrideAccess: true,
    req,
  });

export const addMember: Endpoint = {
  path: "/:id/members",
  method: "post",
  handler: async (req) => {
    const me = await sessionAccount(req);
    if (!me) return Response.json({ error: "Not logged in." }, { status: 401 });
    const calendar = await calendarById(req, String(req.routeParams?.id));
    if (!calendar || calendar.owner !== String(me.id)) {
      return Response.json({ error: "Not your calendar." }, { status: 403 });
    }
    if (tooMany(String(me.id))) {
      return Response.json({ error: "Too many tries." }, { status: 429 });
    }

    const body = (await req.json?.().catch(() => null)) as {
      email?: unknown;
    } | null;
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email.includes("@")) {
      return Response.json({ error: "No email address." }, { status: 400 });
    }

    // Whose address it is – a confirmed account's only: an address nobody
    // confirmed is no person yet.
    const { docs } = await req.payload.find({
      collection: "accounts",
      where: {
        and: [{ email: { equals: email } }, { _verified: { equals: true } }],
      },
      select: { email: true },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    });
    const person = docs[0] ? String(docs[0].id) : null;
    // In it already: nothing to invite to – and answered all the same.
    if (!(person && calendar.members.includes(person))) {
      const from = (await req.payload.findByID({
        collection: "accounts",
        id: me.id,
        select: { name: true, locale: true },
        depth: 0,
        overrideAccess: true,
      })) as { name?: string; locale?: string };
      await invite(req, {
        email,
        calendar: calendar.id,
        from: {
          id: String(me.id),
          name: from.name ?? "",
          locale: from.locale ?? "de",
        },
      });
      if (person) {
        // An account: its open apps show the invitation at once (sync/
        // live.ts), and its devices hear of it, unless it would rather not
        // (features/push) – sent after this has answered.
        nudge([person]);
        notifyInvited(req.payload, {
          calendar: calendar.id,
          who: person,
          by: String(me.id),
        });
      }
    }
    return Response.json({ invited: true });
  },
};

export const removeMember: Endpoint = {
  path: "/:id/members/:accountId",
  method: "delete",
  handler: async (req) => {
    const me = await sessionAccount(req);
    if (!me) return Response.json({ error: "Not logged in." }, { status: 401 });
    const calendar = await calendarById(req, String(req.routeParams?.id));
    const who = String(req.routeParams?.accountId);
    const mine = calendar?.owner === String(me.id);
    // The owner removes anyone but themselves; a member removes themselves.
    if (
      !calendar ||
      who === calendar.owner ||
      !(mine || who === String(me.id))
    ) {
      return Response.json({ error: "Not allowed." }, { status: 403 });
    }
    if (calendar.members.includes(who)) {
      // First their stamps – so none stays shared with a calendar its owner
      // isn't in.
      await unshare(req, calendar.id, who);
      await touch(
        req,
        calendar.id,
        calendar.members.filter((m) => m !== who),
        String(me.id)
      );
      nudge([who]);
      await nudgeCalendars(req, [calendar.id]);
    }
    return Response.json({ removed: true });
  },
};
