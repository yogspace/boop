import type { Where } from "payload";

/**
 * How long an invitation lasts – the one rule behind taking one up, listing
 * and sweeping them (invites.ts), and behind the texts that name the
 * deadline. No server imports here: the pages and the unit tests use it too.
 */

/** An invitation is good for this many days after it was sent. */
export const INVITE_DAYS = 14;

const DAY_MS = 86_400_000;

/** An invitation's two dates, as stored or as JSON. */
type Dated = { createdAt?: unknown; expiresAt?: unknown };

const time = (value: unknown): number | null => {
  if (!(typeof value === "string" || value instanceof Date)) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/**
 * When an invitation ends: INVITE_DAYS after it was made. Its own
 * `expiresAt` counts only where that is earlier – so one from before (made
 * for 30 days) or one without any goes by the day it was made. Knowing
 * neither date: null.
 */
export const inviteEnd = (invite: Dated): Date | null => {
  const made = time(invite.createdAt);
  const ends = [
    made === null ? null : made + INVITE_DAYS * DAY_MS,
    time(invite.expiresAt),
  ].filter((end): end is number => end !== null);
  return ends.length ? new Date(Math.min(...ends)) : null;
};

/** Over – and so is one that can't say when it ends. */
export const inviteExpired = (invite: Dated, now = Date.now()) => {
  const end = inviteEnd(invite);
  return !end || end.getTime() <= now;
};

/** The `expiresAt` of an invitation made now. */
export const inviteExpiresAt = (now = Date.now()) =>
  new Date(now + INVITE_DAYS * DAY_MS).toISOString();

/** Every invitation that is over, as a query – `inviteExpired`'s rule. */
export const expiredInvites = (now = Date.now()): Where => ({
  or: [
    {
      createdAt: {
        less_than_equal: new Date(now - INVITE_DAYS * DAY_MS).toISOString(),
      },
    },
    { expiresAt: { less_than_equal: new Date(now).toISOString() } },
  ],
});
