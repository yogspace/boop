import type { Endpoint, PayloadRequest } from "payload";
import { type SessionAccount, sessionAccount } from "@/features/accounts/session";
import { nudge } from "@/features/sync/live";
import type { InvitationDoc } from "@/features/sync/protocol";
import { inviteEnd, inviteExpired } from "../invite-expiry";
import { type InviteRow, join, row } from "../invites";
import { idOf } from "../membership";
import { DEFAULT_PALETTE, isColorKey } from "../palette";

/**
 * The invitations to an account – to its confirmed address, from the
 * calendars' owners (invites.ts). They come with the sync (`invitationsOf`)
 * and the app shows them; here they are taken up or turned down:
 *
 *   POST /api/invitations/:id/accept    a member now – { calendar }
 *   POST /api/invitations/:id/decline   gone, nothing else – { declined }
 *
 * Only the account's own – one to another address is “not found”, like one
 * that never was – and only while it lasts (410 after). Turning one down
 * tells nobody: its owner merely no longer sees it waiting.
 *
 * Of an invitation the app learns the calendar's name and color, who sent
 * it by name, and until when (`InvitationDoc`) – never its token (the
 * mail's link) and never anyone's address.
 */

type Doc = Record<string, unknown>;

/** The account's address as invitations keep theirs – or none. */
const addressOf = (account: { email?: unknown }) =>
  typeof account.email === "string" ? account.email.trim().toLowerCase() : "";

/**
 * The open invitations to an account, oldest first – for the sync. Not one
 * to a calendar that is gone, nor to one it is in already (it came in by
 * another way – a link): nothing to answer there.
 */
export const invitationsOf = async (
  req: PayloadRequest,
  account: { id: string; email?: unknown },
  now = Date.now()
): Promise<InvitationDoc[]> => {
  const email = addressOf(account);
  if (!email) return [];
  const { docs } = await req.payload.find({
    collection: "invites",
    where: { email: { equals: email } },
    select: { calendar: true, invitedBy: true, createdAt: true, expiresAt: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  });
  const open = docs
    .map((doc) => row(doc as unknown as Doc))
    .filter((invite) => !inviteExpired(invite, now));
  if (!open.length) return [];

  const byId = (found: { docs: unknown[] }) =>
    new Map(
      (found.docs as Doc[]).map((doc) => [String(doc.id), doc] as const)
    );
  const [calendars, senders] = await Promise.all([
    req.payload
      .find({
        collection: "calendars",
        where: { id: { in: [...new Set(open.map((one) => one.calendar))] } },
        select: { name: true, color: true, members: true, deleted: true },
        depth: 0,
        pagination: false,
        overrideAccess: true,
        req,
      })
      .then(byId),
    req.payload
      .find({
        collection: "accounts",
        where: { id: { in: [...new Set(open.map((one) => one.invitedBy))] } },
        select: { name: true },
        depth: 0,
        pagination: false,
        overrideAccess: true,
        req,
      })
      .then(byId),
  ]);

  return open
    .map((invite) => ({ invite, end: inviteEnd(invite)?.getTime() ?? now }))
    .sort((a, b) => a.end - b.end)
    .flatMap(({ invite, end }) => {
      const calendar = calendars.get(invite.calendar);
      const members = Array.isArray(calendar?.members)
        ? calendar.members.map(idOf)
        : [];
      if (!calendar || calendar.deleted || members.includes(account.id)) {
        return [];
      }
      return [
        {
          id: invite.id,
          calendar: String(calendar.name ?? ""),
          // As the sync hands out every color: its key (sync/pull.ts).
          color: isColorKey(calendar.color)
            ? calendar.color
            : DEFAULT_PALETTE[0].key,
          from: String(senders.get(invite.invitedBy)?.name ?? ""),
          expiresAt: new Date(end).toISOString(),
        },
      ];
    });
};

/**
 * One of the account's own invitations, by its id – over or not: the
 * caller looks. None for an id that is no invitation's, or one to another
 * address.
 */
const ownInvitation = async (
  req: PayloadRequest,
  account: SessionAccount,
  id: string
): Promise<InviteRow | null> => {
  const email = addressOf(account);
  // Mongo's ids – anything else is none.
  if (!(email && /^[0-9a-f]{24}$/.test(id))) return null;
  const { docs } = await req.payload.find({
    collection: "invites",
    where: { and: [{ id: { equals: id } }, { email: { equals: email } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });
  return docs[0] ? row(docs[0] as unknown as Doc) : null;
};

/** An answer to an invitation – the account's own, and while it lasts. */
const answer =
  (
    then: (
      req: PayloadRequest,
      invite: InviteRow,
      account: SessionAccount
    ) => Promise<Response>
  ): Endpoint["handler"] =>
  async (req) => {
    const account = await sessionAccount(req);
    if (!account)
      return Response.json({ error: "Not logged in." }, { status: 401 });
    const invite = await ownInvitation(
      req,
      account,
      String(req.routeParams?.id)
    );
    if (!invite) return Response.json({ error: "Not found." }, { status: 404 });
    if (inviteExpired(invite)) {
      return Response.json(
        { error: "Expired.", expired: true },
        { status: 410 }
      );
    }
    return then(req, invite, account);
  };

export const invitationEndpoints: Endpoint[] = [
  {
    // Yes: in it, as by the mail's link – the others hear of it, and every
    // open app of theirs and the account's syncs (invites.ts, `join`).
    path: "/invitations/:id/accept",
    method: "post",
    handler: answer(async (req, invite, account) =>
      (await join(req, invite, account))
        ? Response.json({ calendar: invite.calendar })
        : Response.json({ error: "Not found." }, { status: 404 })
    ),
  },
  {
    // No: the invitation goes, and that is all. The account's other devices
    // drop it at once.
    path: "/invitations/:id/decline",
    method: "post",
    handler: answer(async (req, invite, account) => {
      await req.payload.delete({
        collection: "invites",
        id: invite.id,
        overrideAccess: true,
        req,
      });
      nudge([String(account.id)]);
      return Response.json({ declined: true });
    }),
  },
];
