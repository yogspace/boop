import type { Endpoint, PayloadRequest } from "payload";
import { sessionAccount } from "@/features/accounts/session";
import { rateLimit } from "@/lib/rate-limit";
import { invite } from "../invites";
import { calendarById } from "../membership";

/**
 * Sharing a calendar: its owner adds someone by their email address – or,
 * without an account, invites them by mail (invites.ts) – and removes
 * members again; a member can leave. The calendar's `changedAt`
 * moves on, so every member's devices learn of it at the next sync.
 *
 *   POST   /api/calendars/:id/members            { email }
 *   DELETE /api/calendars/:id/members/:accountId
 */

// Looking people up by address is limited, so it can't be used to probe
// which addresses have an account.
const tooMany = rateLimit({ limit: 30, windowMs: 60 * 60 * 1000 });

const touch = (req: PayloadRequest, id: string, members: string[]) =>
  req.payload.update({
    collection: "calendars",
    id,
    data: { members, changedAt: new Date().toISOString() },
    context: { sync: true },
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

    // Only verified accounts – an address nobody confirmed is no person yet.
    const { docs } = await req.payload.find({
      collection: "accounts",
      where: {
        and: [{ email: { equals: email } }, { _verified: { equals: true } }],
      },
      select: { name: true },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    });
    const person = docs[0];
    if (!person) {
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
      return Response.json({ added: false, invited: true });
    }
    const id = String(person.id);
    if (!calendar.members.includes(id)) {
      await touch(req, calendar.id, [...calendar.members, id]);
    }
    return Response.json({
      added: true,
      person: { id, name: (person as { name?: string }).name ?? "" },
    });
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
      await touch(
        req,
        calendar.id,
        calendar.members.filter((m) => m !== who)
      );
    }
    return Response.json({ removed: true });
  },
};
