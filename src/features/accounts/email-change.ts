import { createHash, randomBytes } from "node:crypto";
import type { Payload } from "payload";
// Relative, not `@/…`: the unit tests import this without the app's aliases.
import {
  emailChangeUntil,
  expiredEmailChanges,
  type NewAddress,
  pendingEmailOf,
} from "./retention";

/**
 * A new address for an account. It is asked for in the account sheet, with
 * the password (session.ts), and noted on the account: the address, until
 * when it can be confirmed (EMAIL_CHANGE_HOURS, retention.ts), and the hash
 * of a token – the token itself only ever goes out in a mail to the new
 * address. Opening its link is the confirmation: the address becomes the
 * account's, what was noted goes, and the link with it. Until then – and if
 * nobody ever opens it – the old address stays: it logs in, it gets the
 * mails. From then on it gets none, and a link for a new password still on
 * its way there is dead: a mailbox one no longer trusts is a reason to
 * change the address.
 *
 * Nobody learns here whether an address already has an account. One that
 * does is noted like any other and answered the same – only no mail goes
 * out, as for a forgotten password: its token is thrown away unseen, so
 * nothing ever confirms it.
 *
 * The database only, with full access, for the server's own use. Who is
 * asking, and the mails, are the callers' (session.ts).
 *
 * A token is only ever compared here, never logged.
 */

/** An account as the database hands it over – what is read of it here. */
type Row = NewAddress & {
  id: string | number;
  email?: unknown;
  name?: unknown;
  locale?: unknown;
};

const ACCOUNTS = "accounts";

/**
 * Nothing noted: no address, no token, no deadline. Made anew for every
 * write – the database adds to what it is handed.
 */
const nothing = () => ({
  pendingEmail: null,
  pendingEmailToken: null,
  pendingEmailExpiresAt: null,
});

// Payload's own rule for an address (its `email` field) – the same here, as
// this writes past it: an address noted has to be one Payload keeps.
const EMAIL =
  /^(?!.*\.\.)[\w!#$%&'*+/=?^`{|}~-](?:[\w!#$%&'*+/=?^`{|}~.-]*[\w!#$%&'*+/=?^`{|}~-])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

/**
 * An address as accounts keep theirs – trimmed, in lower case – or null for
 * what is none.
 */
export const cleanEmail = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
};

/** A link's secret – 48 hex digits, made anew for every wish. */
const newToken = () => randomBytes(24).toString("hex");

const isToken = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{48}$/.test(value);

/** What is kept of a token: enough to know it again, not to make its link. */
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/** Is there an account with this address – confirmed or not? */
const taken = async (payload: Payload, email: string) => {
  const { totalDocs } = await payload.count({
    collection: ACCOUNTS,
    where: { email: { equals: email } },
    overrideAccess: true,
  });
  return totalDocs > 0;
};

/** The database's own “one account per address” (a ValidationError). */
const refusedAsTaken = (error: unknown) =>
  Boolean(
    (
      error as { data?: { errors?: { path?: string }[] } } | null
    )?.data?.errors?.some((refused) => refused.path === "email")
  );

export type Asked =
  /** No address at all – or the one the account has already. */
  | { ok: false; reason: "invalid" | "same" }
  | {
      ok: true;
      /** The address noted, as the account sheet shows it waiting. */
      pendingEmail: string;
      /**
       * For the link in the mail to it – null when the address is someone
       * else's: no mail goes out, and nothing else tells.
       */
      token: string | null;
    };

/**
 * Notes a new address on an account – in place of one it was waiting for,
 * whose link is dead with that. The caller has made sure who is asking.
 */
export const askEmailChange = async (
  payload: Payload,
  account: { id: string | number; email?: unknown },
  wanted: unknown,
  now = Date.now()
): Promise<Asked> => {
  const email = cleanEmail(wanted);
  if (!email) return { ok: false, reason: "invalid" };
  if (email === cleanEmail(account.email)) return { ok: false, reason: "same" };
  const token = newToken();
  // Noted either way – taken or free, the account looks the same after.
  await payload.db.updateOne({
    collection: ACCOUNTS,
    id: account.id,
    data: {
      pendingEmail: email,
      pendingEmailToken: tokenHash(token),
      pendingEmailExpiresAt: emailChangeUntil(now).toISOString(),
    },
    returning: false,
  });
  return {
    ok: true,
    pendingEmail: email,
    token: (await taken(payload, email)) ? null : token,
  };
};

/** Takes back what was noted – its link is dead at once. */
export const dropEmailChange = async (
  payload: Payload,
  id: string | number
) => {
  await payload.db.updateOne({
    collection: ACCOUNTS,
    id,
    data: nothing(),
    returning: false,
  });
};

export type Confirmed =
  /**
   * No such link (never, used, taken back, replaced by a newer one), too
   * late – or the address became someone else's meanwhile.
   */
  | { ok: false; reason: "invalid" | "expired" | "taken" }
  | {
      ok: true;
      /** The account as it is now – with its new address. */
      account: { id: string; email: string; name: string; locale: string };
      /** The address it had – it hears of the change. */
      was: string;
    };

/**
 * Redeems the token of a link: the address noted with it becomes the
 * account's, and what was noted goes – in one write that asks for the token
 * once more, so of two opening the link at the same moment one finds it
 * gone. The old address counts until that write; with it goes a link for a
 * new password sent there (Payload's `resetPasswordToken`).
 */
export const confirmEmailChange = async (
  payload: Payload,
  token: unknown,
  now = Date.now()
): Promise<Confirmed> => {
  if (!isToken(token)) return { ok: false, reason: "invalid" };
  const noted = { pendingEmailToken: { equals: tokenHash(token) } };
  const account = await payload.db.findOne<Row>({
    collection: ACCOUNTS,
    where: noted,
    select: { email: true, pendingEmail: true, pendingEmailExpiresAt: true },
  });
  if (!account) return { ok: false, reason: "invalid" };
  const email = pendingEmailOf(account, now);
  // Over – the cleanup takes it away (cleanup.ts).
  if (!email) return { ok: false, reason: "expired" };
  const mine = { and: [{ id: { equals: String(account.id) } }, noted] };

  /** Someone else's by now: it can't come true any more – nothing to wait for. */
  const lost = async (): Promise<Confirmed> => {
    await payload.db.updateOne({
      collection: ACCOUNTS,
      where: mine,
      data: nothing(),
      returning: false,
    });
    return { ok: false, reason: "taken" };
  };

  if (await taken(payload, email)) return lost();
  let changed: Row | null;
  try {
    changed = (await payload.db.updateOne({
      collection: ACCOUNTS,
      where: mine,
      data: {
        email,
        ...nothing(),
        resetPasswordToken: null,
        resetPasswordExpiration: null,
      },
      select: { name: true, locale: true },
    })) as Row | null;
  } catch (error) {
    // Taken in this very moment – the database allows one account per
    // address.
    if (refusedAsTaken(error)) return lost();
    throw error;
  }
  // Redeemed, taken back or replaced between the two looks.
  if (!changed) return { ok: false, reason: "invalid" };
  return {
    ok: true,
    account: {
      id: String(changed.id),
      email,
      name: String(changed.name ?? ""),
      locale: String(changed.locale ?? "de"),
    },
    was: String(account.email ?? ""),
  };
};

/**
 * Takes away every new address whose time is up – for the daily cleanup
 * (cleanup.ts). The accounts stay as they are otherwise, `updatedAt` too.
 * Returns how many; with `dry` it only counts.
 */
export const sweepEmailChanges = async (
  payload: Payload,
  { now = Date.now(), dry = false }: { now?: number; dry?: boolean } = {}
) => {
  const where = expiredEmailChanges(now);
  const { totalDocs } = await payload.count({
    collection: ACCOUNTS,
    where,
    overrideAccess: true,
  });
  if (totalDocs && !dry) {
    await payload.db.updateMany({
      collection: ACCOUNTS,
      where,
      data: { ...nothing(), updatedAt: null },
      returning: false,
    });
  }
  return totalDocs;
};
