import { randomBytes } from "node:crypto";
import type {
  CollectionConfig,
  Endpoint,
  Payload,
  PayloadRequest,
} from "payload";
import { hiddenUnlessSupport, sealed } from "@/access";
import { sessionAccount } from "@/features/accounts/session";
import { nudgeCalendars } from "@/features/sync/live";
import { getDictionary } from "@/features/translations/get-texts";
import { isLocale, type Locale } from "@/i18n/config";
import { mailLayout } from "@/lib/mail-layout";
import { serverUrl } from "@/lib/server-url";
import {
  expiredInvites,
  INVITE_DAYS,
  inviteEnd,
  inviteExpired,
  inviteExpiresAt,
} from "./invite-expiry";
import { calendarById, idOf } from "./membership";

/**
 * Inviting someone to a calendar, by their address – with an account or
 * without, nobody is in before saying yes. The address gets a mail with a
 * link; whoever opens it and logs in (or signs up, or is logged in
 * already) joins the calendar: following the link is the yes. An account
 * with that address – a confirmed one – sees the invitation in the app as
 * well, and takes it up or turns it down there (endpoints/invitations.ts).
 *
 * Invitations go once answered or taken back – or after INVITE_DAYS
 * (invite-expiry.ts), as the mail says: one that is over is refused (the
 * page says so) and swept away – whenever someone invites, and by the
 * cleanup cron (/next/cron/cleanup).
 */

export type InviteRow = {
  id: string;
  email: string;
  calendar: string;
  invitedBy: string;
  token: string;
  /** The two dates its end goes by (`inviteEnd`). */
  createdAt: unknown;
  expiresAt: unknown;
};

export const row = (doc: Record<string, unknown>): InviteRow => ({
  id: String(doc.id),
  email: String(doc.email ?? ""),
  calendar: idOf(doc.calendar) ?? "",
  invitedBy: idOf(doc.invitedBy) ?? "",
  token: String(doc.token ?? ""),
  createdAt: doc.createdAt,
  expiresAt: doc.expiresAt,
});

/** Who sent it, by name – all the invitation page learns of them. */
const senderName = async (req: PayloadRequest, id: string) => {
  const from = await req.payload.findByID({
    collection: "accounts",
    id,
    select: { name: true },
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  });
  return String((from as { name?: string } | null)?.name ?? "");
};

export const Invites: CollectionConfig = {
  slug: "invites",
  labels: { singular: "Invitation", plural: "Invitations" },
  // The app's through the endpoints here alone; closed over REST, for
  // admins too – they read it in support mode (src/access).
  access: sealed,
  admin: {
    hidden: hiddenUnlessSupport,
    group: "Calendars",
    useAsTitle: "email",
    defaultColumns: ["email", "calendar", "invitedBy", "expiresAt"],
    description: `Invitations to calendars, by address – with an account or without. Gone once answered or taken back, or after ${INVITE_DAYS} days.`,
  },
  fields: [
    { name: "email", type: "email", required: true, index: true },
    {
      name: "calendar",
      type: "relationship",
      relationTo: "calendars",
      required: true,
    },
    {
      name: "invitedBy",
      type: "relationship",
      relationTo: "accounts",
      required: true,
    },
    {
      // The link's secret – whoever has it joins the calendar. Never read
      // over REST, in support mode neither.
      name: "token",
      type: "text",
      required: true,
      unique: true,
      index: true,
      access: { read: () => false },
      admin: { hidden: true },
    },
    { name: "expiresAt", type: "date", required: true, index: true },
  ],
  endpoints: [
    {
      // What the invitation page shows – only with the link's token.
      path: "/:token",
      method: "get",
      handler: async (req) => {
        const invite = await byToken(req, String(req.routeParams?.token));
        if (!invite)
          return Response.json({ error: "Not found." }, { status: 404 });
        const from = await senderName(req, invite.invitedBy);
        // Too late – said as such, with whom to ask for a new one.
        if (inviteExpired(invite)) return gone({ from });
        const calendar = await calendarById(req, invite.calendar);
        if (!calendar)
          return Response.json({ error: "Not found." }, { status: 404 });
        return Response.json({
          calendar: await calendarName(req, calendar.id),
          from,
          expiresAt: inviteEnd(invite)?.toISOString() ?? null,
        });
      },
    },
    {
      path: "/:token/accept",
      method: "post",
      handler: async (req) => {
        const account = await sessionAccount(req);
        if (!account)
          return Response.json({ error: "Not logged in." }, { status: 401 });
        const invite = await byToken(req, String(req.routeParams?.token));
        if (!invite)
          return Response.json({ error: "Not found." }, { status: 404 });
        if (inviteExpired(invite)) return gone();
        const joined = await join(req, invite, account);
        return joined
          ? Response.json({ calendar: invite.calendar })
          : Response.json({ error: "Not found." }, { status: 404 });
      },
    },
  ],
  timestamps: true,
};

/** The answer to an invitation that is over (410) – apart from “no such”. */
const gone = (more: object = {}) =>
  Response.json({ error: "Expired.", expired: true, ...more }, { status: 410 });

/** The invitation behind a link – over or not: the caller looks. */
const byToken = async (req: PayloadRequest, token: string) => {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const { docs } = await req.payload.find({
    collection: "invites",
    where: { token: { equals: token } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return docs[0] ? row(docs[0] as unknown as Record<string, unknown>) : null;
};

/**
 * Removes every invitation that is over – with the invited addresses in
 * them. Returns how many went.
 */
export const sweepInvites = async (payload: Payload) => {
  const { docs } = await payload.delete({
    collection: "invites",
    where: expiredInvites(),
    overrideAccess: true,
  });
  return docs.length;
};

const calendarName = async (req: PayloadRequest, id: string) => {
  const doc = await req.payload.findByID({
    collection: "calendars",
    id,
    select: { name: true },
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  });
  return String((doc as { name?: string } | null)?.name ?? "");
};

/**
 * The account joins the invitation's calendar; the invitation goes – and so
 * does any other to this calendar for the account's own address: it is in
 * now, and its owner sees nobody waiting. False when the calendar is gone.
 */
export const join = async (
  req: PayloadRequest,
  invite: InviteRow,
  account: { id: string | number; email?: string }
) => {
  const id = String(account.id);
  const calendar = await calendarById(req, invite.calendar);
  const email = account.email?.trim().toLowerCase();
  await req.payload.delete({
    collection: "invites",
    where: {
      or: [
        { id: { equals: invite.id } },
        ...(email
          ? [
              {
                and: [
                  { email: { equals: email } },
                  { calendar: { equals: invite.calendar } },
                ],
              },
            ]
          : []),
      ],
    },
    overrideAccess: true,
  });
  if (!calendar) return false;
  if (!calendar.members.includes(id)) {
    await req.payload.update({
      collection: "calendars",
      id: calendar.id,
      data: {
        members: [...calendar.members, id],
        changedAt: new Date().toISOString(),
      },
      // Who came in is who did it – the others hear of it (features/push).
      context: { sync: true, by: id },
      overrideAccess: true,
    });
    await nudgeCalendars(req, [calendar.id]);
  }
  return true;
};

/**
 * Invites an address to a calendar: one invitation per address and
 * calendar – a new one replaces it, with a new deadline – and the mail,
 * which names that deadline. The mail is in the sender's language, its
 * words the CMS's where it has them (`mail.invite`, i18n/dictionaries.ts).
 * Whether the address is an account's is the caller's business
 * (endpoints/members.ts): the row and the mail are the same either way.
 */
export const invite = async (
  req: PayloadRequest,
  {
    email,
    calendar,
    from,
  }: {
    email: string;
    calendar: string;
    from: { id: string; name: string; locale: string };
  }
) => {
  const now = Date.now();
  // Old ones go – what is over anywhere, and this address's for this
  // calendar.
  await req.payload.delete({
    collection: "invites",
    where: {
      or: [
        expiredInvites(now),
        {
          and: [
            { email: { equals: email } },
            { calendar: { equals: calendar } },
          ],
        },
      ],
    },
    overrideAccess: true,
  });
  const token = randomBytes(24).toString("hex");
  await req.payload.create({
    collection: "invites",
    data: {
      email,
      calendar,
      invitedBy: from.id,
      token,
      expiresAt: inviteExpiresAt(now),
    },
    overrideAccess: true,
  });

  const locale: Locale = isLocale(from.locale) ? from.locale : "de";
  const t = (await getDictionary(locale)).mail.invite;
  const body = t.body(from.name, await calendarName(req, calendar));
  await req.payload.sendEmail({
    to: email,
    subject: t.subject(from.name || "Boop"),
    html: mailLayout({
      lang: locale,
      preheader: body,
      title: t.title,
      paragraphs: [body, t.valid],
      button: {
        label: t.button,
        url: `${serverUrl()}/${locale}/invite?token=${token}`,
      },
      footnote: t.footnote,
    }),
  });
};

/** The owner's view of open invitations – and taking one back. */
export const inviteEndpoints: Endpoint[] = [
  {
    path: "/:id/invites",
    method: "get",
    handler: async (req) => {
      const me = await sessionAccount(req);
      const calendar = await calendarById(req, String(req.routeParams?.id));
      if (!(me && calendar && calendar.owner === String(me.id))) {
        return Response.json({ error: "Not allowed." }, { status: 403 });
      }
      const { docs } = await req.payload.find({
        collection: "invites",
        where: { calendar: { equals: calendar.id } },
        select: { email: true, createdAt: true, expiresAt: true },
        depth: 0,
        pagination: false,
        overrideAccess: true,
      });
      return Response.json({
        // Open ones only – one that is over waits for the sweep.
        invites: docs
          .filter((doc) => !inviteExpired(doc))
          .map((doc) => ({
            id: String(doc.id),
            email: String((doc as { email?: string }).email ?? ""),
          })),
      });
    },
  },
  {
    path: "/:id/invites/:invite",
    method: "delete",
    handler: async (req) => {
      const me = await sessionAccount(req);
      const calendar = await calendarById(req, String(req.routeParams?.id));
      if (!(me && calendar && calendar.owner === String(me.id))) {
        return Response.json({ error: "Not allowed." }, { status: 403 });
      }
      await req.payload.delete({
        collection: "invites",
        where: {
          and: [
            { id: { equals: String(req.routeParams?.invite) } },
            { calendar: { equals: calendar.id } },
          ],
        },
        overrideAccess: true,
      });
      return Response.json({ removed: true });
    },
  },
];
