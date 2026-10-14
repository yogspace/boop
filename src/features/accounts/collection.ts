import {
  APIError,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionBeforeOperationHook,
  type CollectionConfig,
} from "payload";
import { adminOnly, isAdmin, visitors } from "@/access";
import { createFirstCalendar } from "@/features/calendar/membership";
import { purgeCalendar } from "@/features/sync/apply";
import { LOCALES } from "@/i18n/config";
import { rateLimit } from "@/lib/rate-limit";
import { REMEMBER_SECONDS } from "./cookie";
import {
  RESET_HOURS,
  resetHtml,
  resetSubject,
  verifyHtml,
  verifySubject,
} from "./emails";
import {
  EMAIL_CHANGE_HOURS,
  INACTIVE_MONTHS,
  UNVERIFIED_DAYS,
  WARNING_DAYS,
} from "./retention";
import { sessionEndpoints } from "./session";

/**
 * The people using Boop: email and password (Payload auth). Signing up sends
 * a mail to confirm the address – only confirmed accounts log in; a
 * forgotten password gets a mail with a link. Everyone gets a first
 * calendar at sign-up. Deleting an account takes its calendars, stamps and
 * placements along (see `removeData`) – also when the daily cleanup deletes
 * one: a sign-up never confirmed, or an account long unused (retention.ts,
 * cleanup.ts).
 *
 * An account sees and changes itself through the app's own endpoints
 * (session.ts) – its name, its language, its address, its end. The admin
 * looks accounts up to help – address, name, the dates – deletes one,
 * unlocks a login and ticks two boxes (`ADMIN_BOXES`), and that is all: no
 * new name, no new address, no new password, and so no way in as someone
 * else. The boxes are the admin's alone – an account never sets them.
 */

// Sign-ups per IP – enough for a family behind one router, not for a bot.
const tooManySignups = rateLimit({ limit: 10, windowMs: 60 * 60 * 1000 });

/**
 * The two boxes an admin ticks on an account – all the CMS can change of
 * one:
 *
 * - `admin`: the app shows this account a link to the CMS (account-sheet.
 *   tsx), lets it pick the stamp colors that aren't public (sync/apply.ts)
 *   and send a stamp it drew to everyone, as a gift from Boop (features/
 *   cards/gifts.ts). That is all: the CMS has logins of its own (`users`),
 *   an account never gets into it, and nothing in src/access looks at the
 *   box. It is told to the account itself (`me`), to no one else.
 * - `neverDelete`: the daily cleanup leaves the account alone – no warning,
 *   no deletion, confirmed address or not (retention.ts). The account can
 *   still delete itself.
 */
const ADMIN_BOXES = ["admin", "neverDelete"] as const;

/**
 * What an admin's change of an account may hold: the two boxes. Everything
 * else is dropped before Payload looks at it – as early as this, because
 * Payload takes a new password straight from the data: it is no field, so
 * no field's access holds it back, and by the time the hooks of a change
 * run (`protectAccount`) it is already on its way to being hashed. With a
 * new password an admin could log in as that person and read what is sealed
 * (src/access). So that one is not dropped quietly but refused.
 *
 * Every update goes through here, one account's or many at once – from the
 * admin's pages and over REST alike.
 */
const onlyTheBoxes: CollectionBeforeOperationHook = ({
  args,
  operation,
  req,
}) => {
  if (operation !== "update" || !isAdmin(req)) return;
  const data = (args.data ?? {}) as Record<string, unknown>;
  if (data.password) {
    throw new APIError("An account's password can't be changed here.", 403);
  }
  return {
    ...args,
    data: Object.fromEntries(
      ADMIN_BOXES.filter((box) => typeof data[box] === "boolean").map((box) => [
        box,
        data[box],
      ])
    ),
  };
};

const limitSignups: CollectionBeforeOperationHook = ({ operation, req }) => {
  if (operation !== "create" || isAdmin(req)) return;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (tooManySignups(ip)) {
    throw new APIError("Too many sign-ups – please try again later.", 429);
  }
};

/**
 * Only a confirmation link confirms an address, and the address stays as
 * confirmed. A new one needs a link of its own, sent to it – whoever opens
 * that confirms it, and only then is it written, past this hook
 * (email-change.ts). Whoever writes here: no admin is let past either.
 */
const protectAccount: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  // Only a new account gets the field (as false); a change never touches it.
  // The admin's boxes likewise: unticked on a new account, and in a change
  // only an admin's count – whichever way the change came, the app's own
  // endpoints too.
  const { _verified, admin, neverDelete, ...rest } = data;
  const boxes = isAdmin(req)
    ? {
        ...(typeof admin === "boolean" && { admin }),
        ...(typeof neverDelete === "boolean" && { neverDelete }),
        // Kept for good: a warning that it will go is taken back with the
        // tick – unticked one day, the account is warned anew.
        ...(neverDelete === true && { deletionWarnedAt: null }),
      }
    : {};
  const next: Record<string, unknown> =
    operation === "create"
      ? { ...rest, _verified: false, admin: false, neverDelete: false }
      : { ...rest, ...boxes };
  if (
    operation === "update" &&
    typeof next.email === "string" &&
    next.email.toLowerCase() !== String(originalDoc?.email ?? "").toLowerCase()
  ) {
    throw new APIError("The email address can't be changed.", 400);
  }
  return next;
};

/** Every account starts with a calendar (calendar/membership.ts). */
const addFirstCalendar: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== "create") return doc;
  await createFirstCalendar(req, doc);
  return doc;
};

/**
 * Before an account goes: its calendars are deleted (the other members'
 * devices learn of it by the marker), it leaves the others' calendars, and
 * its stamps and the stamps it placed elsewhere are removed – with its
 * stamps' prints, whoever made them, and the invitations it sent. Its notes
 * elsewhere stay without its name; its notification devices and settings
 * go (features/push), and so do its addresses for calendar apps – with
 * everyone's for the calendars that went with it (features/ical). The
 * cards it sent go (features/cards); the stamps others took from them stay
 * theirs, only without the giver.
 */
const removeData: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const account = String(id);
  const now = new Date().toISOString();
  const { payload } = req;
  const find = (collection: "calendars", where: object) =>
    payload.find({
      collection,
      where: where as never,
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    });

  const owned = await find("calendars", { owner: { equals: account } });
  for (const calendar of owned.docs) {
    await purgeCalendar(req, String(calendar.id));
    await payload.update({
      collection: "calendars",
      id: calendar.id,
      data: { deleted: true, name: "–", members: [], changedAt: now },
      context: { sync: true },
      overrideAccess: true,
      req,
    });
  }

  const joined = await find("calendars", {
    and: [{ members: { equals: account } }, { owner: { not_equals: account } }],
  });
  for (const calendar of joined.docs) {
    const members = ((calendar.members ?? []) as unknown[])
      .map((m) =>
        typeof m === "object" && m
          ? String((m as { id: unknown }).id)
          : String(m)
      )
      .filter((m) => m !== account);
    await payload.update({
      collection: "calendars",
      id: calendar.id,
      data: { members, changedAt: now },
      context: { sync: true },
      overrideAccess: true,
      req,
    });
  }

  // What it stamped elsewhere – and every print of its stamps, also those
  // others made with them: a deleted stamp takes its prints along, as in
  // the app (sync/apply.ts).
  const stamps = await payload.find({
    collection: "stamps",
    where: { owner: { equals: account } },
    select: { owner: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  });
  const stampIds = stamps.docs.map((stamp) => String(stamp.id));
  await payload.update({
    collection: "placements",
    where: {
      or: [
        { placedBy: { equals: account } },
        ...(stampIds.length ? [{ stamp: { in: stampIds } }] : []),
      ],
    },
    data: { deleted: true, changedAt: now },
    context: { sync: true },
    overrideAccess: true,
    req,
  });
  await payload.update({
    collection: "stamps",
    where: { owner: { equals: account } },
    data: { deleted: true, name: "", drawing: null, changedAt: now },
    context: { sync: true },
    overrideAccess: true,
    req,
  });

  // The cards it sent – nobody takes them any more. Those who did keep
  // their stamps, without whom they came from: no name, no account. A
  // change, so their devices take it over.
  await payload.delete({
    collection: "cards",
    where: { from: { equals: account } },
    overrideAccess: true,
    req,
  });
  const copies = await payload.find({
    collection: "stamps",
    where: { "origin.from": { equals: account } },
    select: { origin: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  });
  for (const copy of copies.docs) {
    await payload.update({
      collection: "stamps",
      id: copy.id,
      data: {
        origin: { ...copy.origin, from: null, name: "", stamp: null },
        changedAt: now,
      },
      context: { sync: true },
      overrideAccess: true,
      req,
    });
  }

  // The invitations it sent wait for nobody now – the addresses in them go.
  await payload.delete({
    collection: "invites",
    where: { invitedBy: { equals: account } },
    overrideAccess: true,
    req,
  });

  // Its notes in others' calendars are the calendar's – they stay, only
  // without it as their writer. No change of the words: `changedAt` stays,
  // so an edit still waiting on a device wins over this.
  await payload.update({
    collection: "notes",
    where: { editedBy: { equals: account } },
    data: { editedBy: null },
    context: { sync: true },
    overrideAccess: true,
    req,
  });

  // Its devices hear nothing more, and what it wanted to hear of goes.
  for (const collection of ["push-subscriptions", "push-settings"] as const) {
    await payload.delete({
      collection,
      where: { account: { equals: account } },
      overrideAccess: true,
      req,
    });
  }

  // No calendar app reads on with its addresses – nor with anyone's for the
  // calendars that just went.
  const gone = owned.docs.map((calendar) => String(calendar.id));
  await payload.delete({
    collection: "calendar-feeds",
    where: {
      or: [
        { account: { equals: account } },
        ...(gone.length ? [{ calendar: { in: gone } }] : []),
      ],
    },
    overrideAccess: true,
    req,
  });
};

export const Accounts: CollectionConfig = {
  slug: "accounts",
  labels: { singular: "Account", plural: "Accounts" },
  auth: {
    // The mails' words come from the CMS (emails.ts) – async, which Payload
    // allows for subject and HTML alike: it awaits both before sending.
    verify: {
      generateEmailSubject: ({ user }) => verifySubject(user),
      generateEmailHTML: verifyHtml,
    },
    forgotPassword: {
      expiration: RESET_HOURS * 60 * 60 * 1000,
      generateEmailSubject: (args) => resetSubject(args?.user),
      generateEmailHTML: (args) => resetHtml(args ?? {}),
    },
    // Logged in for 30 days on a device – the app is used daily. Without
    // “stay logged in” a login is cut short (session.ts).
    tokenExpiration: REMEMBER_SECONDS,
    maxLoginAttempts: 8,
    lockTime: 15 * 60 * 1000,
    cookies: {
      sameSite: "Lax",
      secure: process.env.NODE_ENV === "production",
    },
  },
  access: {
    // Never into the admin – that is for `users`.
    admin: () => false,
    // Signing up. Not from the admin: an account made there would be one
    // whose password the admin knows.
    create: visitors,
    // The admin's list. The app asks through its own endpoints (session.ts),
    // which need none of these.
    read: adminOnly,
    // The admin – for the two boxes, and nothing else gets through
    // (`onlyTheBoxes`): a new address or password would be a way in as that
    // person. The app changes name and language through PATCH /me, and only
    // those; its address through a link sent to the new one.
    update: adminOnly,
    // The admin – with everything in it (`removeData`). The app deletes
    // through DELETE /me, which asks for the password once more.
    delete: adminOnly,
    unlock: adminOnly,
    readVersions: adminOnly,
  },
  admin: {
    group: "People",
    useAsTitle: "email",
    defaultColumns: ["name", "email", "_verified", "lastSeenAt", "createdAt"],
    description: `People using Boop – to look up and to help, not to edit: of an account only the two boxes “Admin” and “Never delete” can be changed here; besides that an account can be deleted or its login unlocked. Deleting an account removes its calendars, its stamps and what it placed elsewhere. Sign-ups never confirmed go after ${UNVERIFIED_DAYS} days; accounts unused for ${INACTIVE_MONTHS} months after a warning mail – unless “Never delete” is ticked.`,
    components: {
      edit: {
        beforeDocumentControls: [
          "@/features/admin/unlock-account#UnlockAccount",
        ],
      },
    },
  },
  fields: [
    // Name and language are the account's own – changed through PATCH /me,
    // which writes past these rules; in the admin they are to read.
    {
      name: "name",
      type: "text",
      required: true,
      maxLength: 40,
      access: { update: () => false },
    },
    {
      // The language of the mails: the page's at sign-up, then the one the
      // app was last used in (boop-app.tsx).
      name: "locale",
      type: "select",
      required: true,
      defaultValue: "de",
      options: [...LOCALES],
      access: { update: () => false },
      admin: {
        description:
          "The language of the mails – the page's at sign-up, then the one the app was last used in. Notifications follow each device's language.",
      },
    },
    // Two of Payload's own for a login, named here only to close them for
    // a change (Payload merges this into its field): the address – a new
    // one comes by a link (email-change.ts) – and the password. That one is
    // no stored field: Payload hashes it and keeps the hash. Naming it lets
    // the admin's page hide “change password”, and the rule holds a new one
    // back a second time (`onlyTheBoxes` is the first). Signing up still
    // sets one – creating stays open.
    { name: "email", type: "email", access: { update: () => false } },
    {
      name: "password",
      type: "text",
      hidden: true,
      access: { update: () => false },
    },
    // The admin's two boxes (`ADMIN_BOXES`) – set in the admin alone, never
    // at sign-up and never by the account.
    {
      name: "admin",
      type: "checkbox",
      defaultValue: false,
      access: { create: () => false, update: ({ req }) => isAdmin(req) },
      admin: {
        position: "sidebar",
        description:
          "Shows this person a link “Open CMS” in the app's account sheet, lets them pick the stamp colors that aren't public (Site → Stamp colors) and send a stamp they drew to every account, as a gift from Boop. Nothing more: the CMS still asks for its own login (Users), and an account never gets into it.",
      },
    },
    {
      name: "neverDelete",
      label: "Never delete",
      type: "checkbox",
      defaultValue: false,
      access: { create: () => false, update: ({ req }) => isAdmin(req) },
      admin: {
        position: "sidebar",
        description: `Keeps this account out of the daily cleanup: no warning mail and no deletion for not using it (${INACTIVE_MONTHS} months), none for an address never confirmed (${UNVERIFIED_DAYS} days). The person can still delete the account in the app.`,
      },
    },
    // When it was last there, and when it was warned it will go for not
    // being there (retention.ts) – written by the server alone: at a login,
    // a sync, the daily cleanup. No one sets them through the API.
    {
      name: "lastSeenAt",
      type: "date",
      index: true,
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        position: "sidebar",
        date: { pickerAppearance: "dayAndTime" },
        description: `Last login or sync – once a day at most. Unused for ${INACTIVE_MONTHS} months, the account is deleted, after a mail ${WARNING_DAYS} days ahead.`,
      },
    },
    {
      name: "deletionWarnedAt",
      type: "date",
      index: true,
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        position: "sidebar",
        date: { pickerAppearance: "dayAndTime" },
        description: `When the mail “your account goes in ${WARNING_DAYS} days” went out. Any login or sync takes it back.`,
      },
    },
    // A new address the account asked for (email-change.ts), until when its
    // link can be opened, and that link's token – as a hash. Written by the
    // server alone, like the dates above; `email` stays what it is until
    // the link is opened.
    {
      name: "pendingEmail",
      type: "email",
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        position: "sidebar",
        description: `A new address the account asked for – not confirmed yet. It becomes the address once the link in the mail to it is opened; unopened, it goes after ${EMAIL_CHANGE_HOURS} hours.`,
      },
    },
    {
      name: "pendingEmailExpiresAt",
      type: "date",
      index: true,
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        position: "sidebar",
        date: { pickerAppearance: "dayAndTime" },
        description: "Until when the new address can be confirmed.",
      },
    },
    {
      // Never read – not over REST, not in the admin, not by the server's
      // own reads: only the database compares it.
      name: "pendingEmailToken",
      type: "text",
      index: true,
      hidden: true,
      access: {
        read: () => false,
        create: () => false,
        update: () => false,
      },
      admin: { hidden: true },
    },
  ],
  // Login, logout, “me”, new password – into the app's own cookie.
  endpoints: sessionEndpoints,
  hooks: {
    beforeOperation: [limitSignups, onlyTheBoxes],
    beforeChange: [protectAccount],
    afterChange: [addFirstCalendar],
    beforeDelete: [removeData],
  },
  timestamps: true,
};
