import {
  APIError,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionBeforeOperationHook,
  type CollectionConfig,
} from "payload";
import { adminOnly, isAdmin, nobody, visitors } from "@/access";
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
import { INACTIVE_MONTHS, UNVERIFIED_DAYS, WARNING_DAYS } from "./retention";
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
 * (session.ts) – its name, its language, its end; over REST nobody changes
 * an account. The admin looks accounts up to help – address, name, the
 * dates – deletes one and unlocks a login, and that is all: no new name, no
 * new address, no new password, and so no way in as someone else.
 */

// Sign-ups per IP – enough for a family behind one router, not for a bot.
const tooManySignups = rateLimit({ limit: 10, windowMs: 60 * 60 * 1000 });

const limitSignups: CollectionBeforeOperationHook = ({ operation, req }) => {
  if (operation !== "create" || isAdmin(req)) return;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (tooManySignups(ip)) {
    throw new APIError("Too many sign-ups – please try again later.", 429);
  }
};

/**
 * Only the confirmation link confirms an address, and the address stays as
 * confirmed: an account can't change it itself (yet – that would need a new
 * confirmation). Whoever writes: no admin is let past either.
 */
const protectAccount: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
}) => {
  // Only a new account gets the field (as false); a change never touches it.
  const { _verified, ...rest } = data;
  const next = operation === "create" ? { ...rest, _verified: false } : rest;
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
 * everyone's for the calendars that went with it (features/ical).
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
    // Nobody over REST – the admin neither: a new address or password would
    // be a way in as that person. The app changes name and language through
    // PATCH /me, and only those.
    update: nobody,
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
    description: `People using Boop – to look up and to help, not to edit: nothing of an account can be changed here, only the account deleted or its login unlocked. Deleting an account removes its calendars, its stamps and what it placed elsewhere. Sign-ups never confirmed go after ${UNVERIFIED_DAYS} days; accounts unused for ${INACTIVE_MONTHS} months after a warning mail.`,
    components: {
      edit: {
        beforeDocumentControls: [
          "@/features/admin/unlock-account#UnlockAccount",
        ],
      },
    },
  },
  fields: [
    { name: "name", type: "text", required: true, maxLength: 40 },
    {
      // The language of the app and of the mails.
      name: "locale",
      type: "select",
      required: true,
      defaultValue: "de",
      options: [...LOCALES],
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
  ],
  // Login, logout, “me”, new password – into the app's own cookie.
  endpoints: sessionEndpoints,
  hooks: {
    beforeOperation: [limitSignups],
    beforeChange: [protectAccount],
    afterChange: [addFirstCalendar],
    beforeDelete: [removeData],
  },
  timestamps: true,
};
