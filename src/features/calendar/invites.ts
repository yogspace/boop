import { randomBytes } from "node:crypto";
import type { CollectionConfig, Endpoint, PayloadRequest } from "payload";
import { adminOnly } from "@/access";
import { sessionAccount } from "@/features/accounts/session";
import { nudgeCalendars } from "@/features/sync/live";
import { isLocale, type Locale } from "@/i18n/config";
import { mailLayout } from "@/lib/mail-layout";
import { serverUrl } from "@/lib/server-url";
import { calendarById, idOf } from "./membership";

/**
 * Inviting someone who has no account yet: the address gets a mail with a
 * link. Whoever opens it and logs in (or signs up) joins the calendar – and
 * logging in with the invited address joins all its calendars anyway.
 * Invitations go once used, or after 30 days.
 */

export const INVITE_DAYS = 30;

type InviteRow = {
  id: string;
  email: string;
  calendar: string;
  invitedBy: string;
  token: string;
  expiresAt: string;
};

const row = (doc: Record<string, unknown>): InviteRow => ({
  id: String(doc.id),
  email: String(doc.email ?? ""),
  calendar: idOf(doc.calendar) ?? "",
  invitedBy: idOf(doc.invitedBy) ?? "",
  token: String(doc.token ?? ""),
  expiresAt: String(doc.expiresAt ?? ""),
});

export const Invites: CollectionConfig = {
  slug: "invites",
  labels: { singular: "Invitation", plural: "Invitations" },
  access: {
    read: adminOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  admin: {
    group: "Calendars",
    useAsTitle: "email",
    defaultColumns: ["email", "calendar", "invitedBy", "expiresAt"],
    description: `Invitations to calendars for addresses without an account. Gone once used or after ${INVITE_DAYS} days.`,
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
      name: "token",
      type: "text",
      required: true,
      unique: true,
      index: true,
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
        const [calendar, from] = await Promise.all([
          calendarById(req, invite.calendar),
          req.payload.findByID({
            collection: "accounts",
            id: invite.invitedBy,
            select: { name: true },
            depth: 0,
            disableErrors: true,
            overrideAccess: true,
          }),
        ]);
        if (!calendar)
          return Response.json({ error: "Not found." }, { status: 404 });
        const name = await calendarName(req, calendar.id);
        return Response.json({
          calendar: name,
          from: (from as { name?: string } | null)?.name ?? "",
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
        const joined = await join(req, invite, String(account.id));
        return joined
          ? Response.json({ calendar: invite.calendar })
          : Response.json({ error: "Not found." }, { status: 404 });
      },
    },
  ],
  timestamps: true,
};

const byToken = async (req: PayloadRequest, token: string) => {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const { docs } = await req.payload.find({
    collection: "invites",
    where: {
      and: [
        { token: { equals: token } },
        { expiresAt: { greater_than: new Date().toISOString() } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return docs[0] ? row(docs[0] as unknown as Record<string, unknown>) : null;
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

/** The account joins the invitation's calendar; the invitation goes. */
const join = async (
  req: PayloadRequest,
  invite: InviteRow,
  account: string
) => {
  const calendar = await calendarById(req, invite.calendar);
  await req.payload.delete({
    collection: "invites",
    id: invite.id,
    overrideAccess: true,
  });
  if (!calendar) return false;
  if (!calendar.members.includes(account)) {
    await req.payload.update({
      collection: "calendars",
      id: calendar.id,
      data: {
        members: [...calendar.members, account],
        changedAt: new Date().toISOString(),
      },
      context: { sync: true },
      overrideAccess: true,
    });
    await nudgeCalendars(req, [calendar.id]);
  }
  return true;
};

/** At login: every open invitation to this address is taken up. */
export const joinInvitedCalendars = async (
  req: PayloadRequest,
  account: { id: string | number; email?: string }
) => {
  if (!account.email) return;
  const { docs } = await req.payload.find({
    collection: "invites",
    where: {
      and: [
        { email: { equals: account.email.toLowerCase() } },
        { expiresAt: { greater_than: new Date().toISOString() } },
      ],
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  for (const doc of docs) {
    await join(
      req,
      row(doc as unknown as Record<string, unknown>),
      String(account.id)
    );
  }
};

const TEXT = {
  de: {
    subject: (from: string) => `${from} lädt dich zu Boop ein`,
    title: "Du bist eingeladen!",
    body: (from: string, calendar: string) =>
      `${from} möchte den Kalender „${calendar}“ mit dir teilen. Boop ist ein Stempelkalender: Ihr malt eure eigenen Stempel und stempelt eure Tage – zusammen.`,
    button: "Einladung ansehen",
    footnote:
      "Du kennst die Person nicht? Dann ignoriere diese Mail einfach – ohne Konto passiert nichts.",
  },
  en: {
    subject: (from: string) => `${from} invites you to Boop`,
    title: "You're invited!",
    body: (from: string, calendar: string) =>
      `${from} would like to share the calendar “${calendar}” with you. Boop is a stamp calendar: you draw your own stamps and stamp your days – together.`,
    button: "See the invitation",
    footnote:
      "Don't know them? Then simply ignore this mail – nothing happens without an account.",
  },
} as const;

/**
 * Invites an address (without an account) to a calendar: one invitation per
 * address and calendar – a new one replaces it – and the mail.
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
  const now = new Date();
  // Old ones go – expired anywhere, and this address's for this calendar.
  await req.payload.delete({
    collection: "invites",
    where: {
      or: [
        { expiresAt: { less_than: now.toISOString() } },
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
      expiresAt: new Date(
        now.getTime() + INVITE_DAYS * 86_400_000
      ).toISOString(),
    },
    overrideAccess: true,
  });

  const locale: Locale = isLocale(from.locale) ? from.locale : "de";
  const t = TEXT[locale];
  const name = await calendarName(req, calendar);
  await req.payload.sendEmail({
    to: email,
    subject: t.subject(from.name || "Boop"),
    html: mailLayout({
      lang: locale,
      preheader: t.body(from.name, name),
      title: t.title,
      paragraphs: [t.body(from.name, name)],
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
        where: {
          and: [
            { calendar: { equals: calendar.id } },
            { expiresAt: { greater_than: new Date().toISOString() } },
          ],
        },
        select: { email: true },
        depth: 0,
        pagination: false,
        overrideAccess: true,
      });
      return Response.json({
        invites: docs.map((doc) => ({
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
