/**
 * How long an account is kept – the rules the daily cleanup goes by
 * (cleanup.ts, /next/cron/cleanup), and the deadlines the mails and the
 * privacy text name. No imports: the unit tests read this too.
 *
 * - An address nobody confirmed: the sign-up goes after UNVERIFIED_DAYS.
 * - An account nobody uses: after INACTIVE_MONTHS without being there it is
 *   deleted – but only after a mail, WARNING_DAYS ahead, and only if it
 *   stayed away for all of them. Being there once takes the warning back.
 * - A new address nobody confirmed (email-change.ts): what was noted for it
 *   goes after EMAIL_CHANGE_HOURS – the account stays, with the address it
 *   had.
 * - An account an admin marked “never delete” (`neverDelete`, collection.ts)
 *   is none of the cleanup's business: not warned, not deleted – unused or
 *   unconfirmed, for however long. Ticked is ticked. The account itself can
 *   still delete itself in the app.
 *
 * “Being there” is noted on the account (`lastSeenAt`) at a login and
 * whenever the app talks to the server – once a day at most. An account
 * without that note (every one from before it was kept) counts as there
 * today: nobody is warned or deleted for lack of data.
 */

/** A sign-up whose address was never confirmed goes after this many days. */
export const UNVERIFIED_DAYS = 30;

/** An account not used for this many months is deleted … */
export const INACTIVE_MONTHS = 24;

/** … after a mail this many days ahead. */
export const WARNING_DAYS = 30;

/** At most this many accounts are warned, and deleted, in one run. */
export const RUN_LIMIT = 50;

/** A new address is to be confirmed within this many hours. */
export const EMAIL_CHANGE_HOURS = 24;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** `lastSeenAt` is written once a day at most. */
const SEEN_EVERY_MS = DAY_MS;

const time = (value: unknown): number | null => {
  if (!(typeof value === "string" || value instanceof Date)) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/** The same day and time, so many months on (UTC). */
const monthsLater = (from: number, months: number) => {
  const date = new Date(from);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.getTime();
};

/** What the rules read of an account. */
export type Kept = {
  createdAt?: unknown;
  _verified?: unknown;
  lastSeenAt?: unknown;
  deletionWarnedAt?: unknown;
  /** Ticked by an admin: the cleanup leaves it alone. */
  neverDelete?: unknown;
};

/** An admin marked it: never warned, never deleted by the cleanup. */
export const keptForGood = (account: Kept) => account.neverDelete === true;

/**
 * The accounts the cleanup may look at, as a query – `keptForGood`'s rule:
 * all but the marked ones (one without the field, from before, is not).
 */
export const notKeptForGood = { neverDelete: { not_equals: true } } as const;

/** What a rule writes to an account. */
export type SeenPatch = {
  lastSeenAt?: string;
  deletionWarnedAt?: string | null;
};

// ── Being there ─────────────────────────────────────────────────────────────

/**
 * What to note on an account that is there right now – or null when its
 * note is fresh enough. A warning is taken back at once, whenever it comes.
 */
export const seenPatch = (
  account: Kept,
  now = Date.now()
): SeenPatch | null => {
  const seen = time(account.lastSeenAt);
  const fresh = seen !== null && now - seen < SEEN_EVERY_MS;
  if (fresh && time(account.deletionWarnedAt) === null) return null;
  return { lastSeenAt: new Date(now).toISOString(), deletionWarnedAt: null };
};

// ── Never confirmed ─────────────────────────────────────────────────────────

/** Sign-ups made at or before this moment are old enough to go. */
export const unverifiedBefore = (now = Date.now()) =>
  new Date(now - UNVERIFIED_DAYS * DAY_MS);

/**
 * A sign-up to delete: its address expressly not confirmed, and made
 * UNVERIFIED_DAYS ago or longer. Anything unclear stays – and so does one
 * marked “never delete”.
 */
export const unverifiedDue = (account: Kept, now = Date.now()) => {
  const made = time(account.createdAt);
  return (
    !keptForGood(account) &&
    account._verified === false &&
    made !== null &&
    made <= unverifiedBefore(now).getTime()
  );
};

// ── A new address, not confirmed ────────────────────────────────────────────

/** What is noted on an account that asked for a new address. */
export type NewAddress = {
  pendingEmail?: unknown;
  pendingEmailExpiresAt?: unknown;
};

/** Until when a new address asked for now can be confirmed. */
export const emailChangeUntil = (now = Date.now()) =>
  new Date(now + EMAIL_CHANGE_HOURS * HOUR_MS);

/**
 * The new address an account is waiting to confirm – null when it asked for
 * none, or its time is up: one that is over counts as none wherever it is
 * read, also before the cleanup took it away. So does one that can't say
 * until when it holds.
 */
export const pendingEmailOf = (
  account: NewAddress,
  now = Date.now()
): string | null => {
  const until = time(account.pendingEmailExpiresAt);
  const email = account.pendingEmail;
  return typeof email === "string" && email && until !== null && now < until
    ? email
    : null;
};

/** Every new address whose time is up, as a query – `pendingEmailOf`'s rule. */
export const expiredEmailChanges = (now = Date.now()) => ({
  pendingEmailExpiresAt: { less_than_equal: new Date(now).toISOString() },
});

// ── Not used for a long time ────────────────────────────────────────────────

/** From when an account last there at `seen` gets the warning. */
export const warnFrom = (seen: number) =>
  monthsLater(seen, INACTIVE_MONTHS) - WARNING_DAYS * DAY_MS;

/** From when it may be deleted – once warned, and not before `warnedUntil`. */
export const deleteFrom = (seen: number) => monthsLater(seen, INACTIVE_MONTHS);

/** A warning holds off the deletion until this moment. */
export const warnedUntil = (warned: number) => warned + WARNING_DAYS * DAY_MS;

/**
 * Accounts last there at or before this moment may be due for the warning
 * – a few days generous (months differ in length): it only narrows down
 * whom the cleanup looks at, `inactivityStep` decides.
 */
export const maybeInactiveBefore = (now = Date.now()) =>
  new Date(
    monthsLater(now + WARNING_DAYS * DAY_MS, -INACTIVE_MONTHS) + 4 * DAY_MS
  );

export type InactivityStep =
  /** Never noted when it was there: it counts as there today. */
  | "note"
  /** Warned, but there since: the warning is off. */
  | "reset"
  /** Away for almost INACTIVE_MONTHS: the mail goes out. */
  | "warn"
  /** Warned, and away for all the WARNING_DAYS since: it goes. */
  | "delete";

/**
 * What the cleanup does with an account today – null: nothing. Always
 * nothing for one marked “never delete”: no note, no warning, no deletion.
 */
export const inactivityStep = (
  account: Kept,
  now = Date.now()
): InactivityStep | null => {
  if (keptForGood(account)) return null;
  const seen = time(account.lastSeenAt);
  if (seen === null) return "note";
  const warned = time(account.deletionWarnedAt);
  if (warned === null) return now >= warnFrom(seen) ? "warn" : null;
  if (seen > warned) return "reset";
  return now >= warnedUntil(warned) && now >= deleteFrom(seen)
    ? "delete"
    : null;
};

/** What a run did – counts only. */
export type InactivityTally = {
  noted: number;
  reset: number;
  warned: number;
  /** Due for the warning, but the mail didn't go out – not warned. */
  mailFailed: number;
  deleted: number;
  /** Due, but over this run's limit – the next run's. */
  left: number;
  /** Something went wrong with these – left as they were, tried again. */
  failed: number;
};

/** How a run reaches the accounts and the mail – the real thing or a test's. */
export type InactivityPorts<T extends Kept> = {
  /** The account as it is right now – null when it is gone. */
  read: (account: T) => Promise<Kept | null>;
  write: (account: T, patch: SeenPatch) => Promise<void>;
  /** Sends the warning. True only when the mail service took the mail. */
  warn: (account: T) => Promise<boolean>;
  /** Deletes the account with everything in it. */
  remove: (account: T) => Promise<void>;
};

/**
 * One run over the accounts that may be due: notes, takes warnings back,
 * warns and deletes – as `inactivityStep` says, with two more locks:
 *
 * - A warning counts only once its mail went out. No mail service, or it
 *   refused: the account is not warned, and so never deleted.
 * - Before an account goes it is read once more. There meanwhile – or
 *   marked “never delete” meanwhile? It stays.
 *
 * With `dry` nothing is written, sent or deleted – it only counts.
 */
export const tendInactive = async <T extends Kept>(
  accounts: T[],
  ports: InactivityPorts<T>,
  {
    now = Date.now(),
    limit = RUN_LIMIT,
    dry = false,
  }: { now?: number; limit?: number; dry?: boolean } = {}
): Promise<InactivityTally> => {
  const tally: InactivityTally = {
    noted: 0,
    reset: 0,
    warned: 0,
    mailFailed: 0,
    deleted: 0,
    left: 0,
    failed: 0,
  };
  const stamp = new Date(now).toISOString();
  // The run's limit holds for the mails tried and for the accounts deleted.
  let mails = 0;

  const tend = async (account: T) => {
    const step = inactivityStep(account, now);
    if (step === "note") {
      if (!dry) {
        await ports.write(account, {
          lastSeenAt: stamp,
          deletionWarnedAt: null,
        });
      }
      tally.noted++;
    } else if (step === "reset") {
      if (!dry) await ports.write(account, { deletionWarnedAt: null });
      tally.reset++;
    } else if (step === "warn") {
      if (mails >= limit) tally.left++;
      else if (dry) {
        mails++;
        tally.warned++;
      } else {
        mails++;
        // The mail first – the note only once it is out.
        if (await ports.warn(account)) {
          await ports.write(account, { deletionWarnedAt: stamp });
          tally.warned++;
        } else tally.mailFailed++;
      }
    } else if (step === "delete") {
      if (tally.deleted >= limit) tally.left++;
      else if (dry) tally.deleted++;
      else {
        const fresh = await ports.read(account);
        if (fresh && inactivityStep(fresh, now) === "delete") {
          await ports.remove(account);
          tally.deleted++;
        }
      }
    }
  };

  for (const account of accounts) {
    try {
      await tend(account);
    } catch {
      // One account's trouble doesn't hold up the others.
      tally.failed++;
    }
  }
  return tally;
};
