import type { Payload, Where } from "payload";
import { expiredInvites } from "@/features/calendar/invite-expiry";
import { sweepInvites } from "@/features/calendar/invites";
import { sendMail } from "@/lib/mail";
import { inactiveMail } from "./emails";
import {
  deleteFrom,
  type InactivityTally,
  maybeInactiveBefore,
  RUN_LIMIT,
  tendInactive,
  unverifiedBefore,
  unverifiedDue,
  WARNING_DAYS,
} from "./retention";
import { patchAccount } from "./seen";

/**
 * The daily cleanup (/next/cron/cleanup) – by the rules of retention.ts:
 * invitations that are over go, sign-ups never confirmed go, accounts long
 * unused get their mail and, a month later, go. Deleting is deleting an
 * account like any other: its calendars, stamps and prints along
 * (`removeData`, collection.ts). The other half of “long unused” is
 * seen.ts: noting whenever an account is there.
 */

type Doc = Record<string, unknown>;

/** Sign-ups never confirmed, old enough – deleted, RUN_LIMIT at most. */
const sweepUnverified = async (
  payload: Payload,
  { now, dry }: { now: number; dry: boolean }
) => {
  const { docs, totalDocs } = await payload.find({
    collection: "accounts",
    where: {
      and: [
        { _verified: { equals: false } },
        { createdAt: { less_than_equal: unverifiedBefore(now).toISOString() } },
      ],
    },
    sort: "createdAt",
    limit: RUN_LIMIT,
    depth: 0,
    overrideAccess: true,
  });
  let deleted = 0;
  let failed = 0;
  for (const doc of docs as unknown as Doc[]) {
    // The rule once more, on the account itself – anything unclear stays.
    if (!unverifiedDue(doc, now)) continue;
    if (dry) {
      deleted++;
      continue;
    }
    try {
      await payload.delete({
        collection: "accounts",
        id: String(doc.id),
        overrideAccess: true,
      });
      deleted++;
    } catch (error) {
      failed++;
      payload.logger.warn({ err: error, msg: "[cleanup] unverified account" });
    }
  }
  return { deleted, failed, left: Math.max(0, totalDocs - docs.length) };
};

/** Accounts long unused: noted, warned, or deleted (retention.ts). */
const tendUnused = async (
  payload: Payload,
  { now, dry }: { now: number; dry: boolean }
): Promise<InactivityTally> => {
  // The ones the rules may have something to do with – they decide.
  const candidates: Where = {
    and: [
      { _verified: { equals: true } },
      {
        or: [
          { lastSeenAt: { equals: null } },
          {
            lastSeenAt: {
              less_than_equal: maybeInactiveBefore(now).toISOString(),
            },
          },
          { deletionWarnedAt: { not_equals: null } },
        ],
      },
    ],
  };
  const { docs } = await payload.find({
    collection: "accounts",
    where: candidates,
    sort: "lastSeenAt",
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  return tendInactive(
    docs as unknown as Doc[],
    {
      read: async (account) =>
        (await payload.findByID({
          collection: "accounts",
          id: String(account.id),
          depth: 0,
          disableErrors: true,
          overrideAccess: true,
        })) as unknown as Doc | null,
      write: async (account, patch) => {
        await patchAccount(payload, String(account.id), patch);
      },
      // Warned only when the mail service took the mail: without one
      // (no RESEND_API_KEY) nobody is warned – and so nobody deleted.
      warn: async (account) => {
        const seen = new Date(String(account.lastSeenAt)).getTime();
        const mail = inactiveMail({
          user: account,
          deleteFrom: new Date(
            Math.max(deleteFrom(seen), now + WARNING_DAYS * 86_400_000)
          ),
        });
        const sent = await sendMail({ to: String(account.email), ...mail });
        return sent.ok;
      },
      remove: async (account) => {
        await payload.delete({
          collection: "accounts",
          id: String(account.id),
          overrideAccess: true,
        });
      },
    },
    { now, dry }
  );
};

export type CleanupResult = {
  dry: boolean;
  invites: number;
  unverified: { deleted: number; failed: number; left: number };
  inactive: InactivityTally;
};

/**
 * One run of the cleanup. With `dry` it only counts what it would do –
 * nothing is written, sent or deleted. Logs the counts, never an address.
 */
export const runCleanup = async (
  payload: Payload,
  { dry = false, now = Date.now() }: { dry?: boolean; now?: number } = {}
): Promise<CleanupResult> => {
  const result: CleanupResult = {
    dry,
    invites: dry
      ? (
          await payload.count({
            collection: "invites",
            where: expiredInvites(now),
            overrideAccess: true,
          })
        ).totalDocs
      : await sweepInvites(payload),
    unverified: await sweepUnverified(payload, { now, dry }),
    inactive: await tendUnused(payload, { now, dry }),
  };
  payload.logger.info(`[cleanup] ${JSON.stringify(result)}`);
  return result;
};
