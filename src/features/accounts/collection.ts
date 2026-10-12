import {
  type Access,
  APIError,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionBeforeOperationHook,
  type CollectionConfig,
} from "payload";
import { accountOf, adminOnly, anyone, isAdmin } from "@/access";
import { purgeCalendar } from "@/features/sync/apply";
import { LOCALES } from "@/i18n/config";
import { newId } from "@/lib/id";
import { rateLimit } from "@/lib/rate-limit";
import {
  localeOf,
  RESET_HOURS,
  resetHtml,
  resetSubject,
  verifyHtml,
  verifySubject,
} from "./emails";
import { sessionEndpoints } from "./session";

/**
 * The people using Boop: email and password (Payload auth). Signing up sends
 * a mail to confirm the address – only confirmed accounts log in; a
 * forgotten password gets a mail with a link. Everyone gets a personal
 * calendar at sign-up. Deleting an account takes its calendars, stamps and
 * placements along (see `removeData`).
 *
 * An account sees and changes only itself; the admin sees all.
 */

/** The account itself – or, for the admin, every one. */
const selfOrAdmin: Access = ({ req }) => {
  if (isAdmin(req)) return true;
  const me = accountOf(req);
  return me ? { id: { equals: me.id } } : false;
};

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
 * Only the confirmation link (or the admin) confirms an address, and the
 * address stays as confirmed: an account can't change it itself (yet – that
 * would need a new confirmation).
 */
const protectAccount: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (isAdmin(req)) return data;
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

/**
 * Every account starts with a calendar of its own – in the calendars'
 * default color (calendar/color-field.ts).
 */
const createPersonalCalendar: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== "create") return doc;
  await req.payload.create({
    collection: "calendars",
    data: {
      id: newId(),
      name: localeOf(doc) === "de" ? "Mein Kalender" : "My calendar",
      owner: doc.id,
      members: [doc.id],
      personal: true,
      deleted: false,
    } as never,
    overrideAccess: true,
    req,
  });
  return doc;
};

/**
 * Before an account goes: its calendars are deleted (the other members'
 * devices learn of it by the marker), it leaves the others' calendars, and
 * its stamps and the stamps it placed elsewhere are removed.
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

  await payload.update({
    collection: "placements",
    where: { placedBy: { equals: account } },
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
};

export const Accounts: CollectionConfig = {
  slug: "accounts",
  labels: { singular: "Account", plural: "Accounts" },
  auth: {
    verify: {
      generateEmailSubject: ({ user }) => verifySubject(user),
      generateEmailHTML: verifyHtml,
    },
    forgotPassword: {
      expiration: RESET_HOURS * 60 * 60 * 1000,
      generateEmailSubject: (args) => resetSubject(args?.user),
      generateEmailHTML: (args) => resetHtml(args ?? {}),
    },
    // Logged in for 30 days on a device – the app is used daily.
    tokenExpiration: 60 * 60 * 24 * 30,
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
    create: anyone,
    read: selfOrAdmin,
    update: selfOrAdmin,
    delete: selfOrAdmin,
    unlock: adminOnly,
    readVersions: adminOnly,
  },
  admin: {
    group: "People",
    useAsTitle: "email",
    defaultColumns: ["name", "email", "_verified", "locale", "createdAt"],
    description:
      "People using Boop. Deleting an account removes its calendars, its stamps and what it placed elsewhere.",
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
  ],
  // Login, logout, “me”, new password – into the app's own cookie.
  endpoints: sessionEndpoints,
  hooks: {
    beforeOperation: [limitSignups],
    beforeChange: [protectAccount],
    afterChange: [createPersonalCalendar],
    beforeDelete: [removeData],
  },
  timestamps: true,
};
