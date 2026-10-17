// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { isLocale, type Locale } from "../../../i18n/config";
import {
  type Doc,
  giftsOf,
  invitedOf,
  type PushSettingsDoc,
  refOf,
  switchesOf,
} from "./settings";
import { DEFAULT_TIME_ZONE, isTimeZone } from "./time";

/**
 * Who hears of what: the devices that said yes, whose login lasts, with
 * the account's switch on – and what a reminder names. Once per window at
 * most (`createThrottle`).
 */

/**
 * Prints of one person in one calendar within this long are one
 * notification – a sticker spree is no ten pings.
 */
export const STAMPED_WINDOW_MS = 10 * 60 * 1000;

/**
 * Invited to one calendar again within this long is one notification –
 * nobody is rung up by being asked over and over.
 */
export const INVITED_WINDOW_MS = 10 * 60 * 1000;

/** A device that said yes – as the database has it, made plain. */
export type SubscriptionRow = {
  id: string;
  account: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** The login it was switched on in (Payload's session id). */
  session: string | null;
  timeZone: string;
  locale: Locale;
  /** The device's day of its last reminder – "2026-10-12". */
  remindedOn: string | null;
  lastUsedAt: string | null;
};

/** A login of the account, as Payload keeps it (`sessions`). */
export type Session = { id?: unknown; expiresAt?: unknown };

/** A device as the database has it, made plain – null if it is no device. */
export const rowOf = (doc: Doc): SubscriptionRow | null => {
  const account = refOf(doc.account);
  const keys = (doc.keys ?? {}) as Doc;
  if (
    !(
      account &&
      typeof doc.endpoint === "string" &&
      typeof keys.p256dh === "string" &&
      typeof keys.auth === "string"
    )
  ) {
    return null;
  }
  return {
    id: String(doc.id),
    account,
    endpoint: doc.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    session:
      typeof doc.session === "string" && doc.session ? doc.session : null,
    timeZone: isTimeZone(doc.timeZone) ? doc.timeZone : DEFAULT_TIME_ZONE,
    locale: isLocale(doc.locale) ? doc.locale : "de",
    remindedOn: typeof doc.remindedOn === "string" ? doc.remindedOn : null,
    lastUsedAt:
      typeof doc.lastUsedAt === "string"
        ? doc.lastUsedAt
        : doc.lastUsedAt instanceof Date
          ? doc.lastUsedAt.toISOString()
          : null,
  };
};

/**
 * Is the login the device was switched on in still there? Logged out (or
 * run out), its notifications stop – they are the account's, and the
 * device may be someone else's by now. One without a login noted (from
 * before Payload kept sessions) counts as there.
 */
export const loginLasts = (
  device: Pick<SubscriptionRow, "session">,
  sessions: readonly Session[] | null | undefined,
  now: Date
) => {
  if (!device.session) return true;
  return (sessions ?? []).some((session) => {
    if (String(session?.id) !== device.session) return false;
    const until = new Date(String(session.expiresAt ?? ""));
    return !Number.isNaN(until.getTime()) && until > now;
  });
};

type Audience = {
  calendar: string;
  members: readonly string[];
  /** Who did it. */
  by: string;
  devices: readonly SubscriptionRow[];
  /** The members' settings, by account. */
  settings: Record<string, PushSettingsDoc | undefined>;
  /** The members' logins, by account. */
  sessions: Record<string, readonly Session[] | undefined>;
  now: Date;
};

/** The other members' devices with this switch on, whose login lasts. */
const wanting = (
  { calendar, members, by, devices, settings, sessions, now }: Audience,
  key: "stamped" | "changed"
) =>
  devices.filter(
    (device) =>
      device.account !== by &&
      members.includes(device.account) &&
      switchesOf(settings[device.account], calendar)[key] &&
      loginLasts(device, sessions[device.account], now)
  );

/**
 * Who hears that someone stamped in a calendar: the devices of its other
 * members – never the stamper's own, also not their other devices – whose
 * account has the switch on, and whose login lasts.
 */
export const stampedTargets = (audience: Audience): SubscriptionRow[] =>
  wanting(audience, "stamped");

/**
 * Who hears that someone changed something: the same, with the third
 * switch – and never whom it is about (`aboutOf`): one who came in knows,
 * one taken out is out.
 */
export const changedTargets = ({
  about,
  ...audience
}: Audience & { about: readonly string[] }): SubscriptionRow[] =>
  wanting(audience, "changed").filter(
    (device) => !about.includes(device.account)
  );

/**
 * Who hears of an invitation to a calendar: the devices of the one invited
 * – nobody else's – whose account has its switch on, and whose login
 * lasts. Nobody invites themselves: one's own doing is no news.
 */
export const invitedTargets = ({
  who,
  by,
  devices,
  settings,
  sessions,
  now,
}: {
  /** Who is invited. */
  who: string;
  /** Who invites them. */
  by: string;
} & Pick<
  Audience,
  "devices" | "settings" | "sessions" | "now"
>): SubscriptionRow[] =>
  who !== by && invitedOf(settings[who])
    ? devices.filter(
        (device) =>
          device.account === who && loginLasts(device, sessions[who], now)
      )
    : [];

/**
 * Who hears of a gift from Boop: the devices of the accounts that got it,
 * whose switch is on and whose login lasts.
 */
export const giftTargets = ({
  devices,
  settings,
  sessions,
  now,
}: Pick<
  Audience,
  "devices" | "settings" | "sessions" | "now"
>): SubscriptionRow[] =>
  devices.filter(
    (device) =>
      giftsOf(settings[device.account]) &&
      loginLasts(device, sessions[device.account], now)
  );

/**
 * The calendars with an entry of the account on a day: a print of its own,
 * or the day's note it wrote last – not emptied. A note someone else wrote
 * last is theirs, not its.
 */
export const enteredIn = ({
  account,
  day,
  prints,
  notes,
}: {
  account: string;
  day: string;
  /** Placements of that day – theirs and others'. */
  prints: readonly Doc[];
  /** Notes of that day – theirs and others'. */
  notes: readonly Doc[];
}): Set<string> => {
  const own = (doc: Doc, by: unknown) =>
    !doc.deleted && doc.date === day && refOf(by) === account;
  return new Set(
    [
      ...prints.filter((print) => own(print, print.placedBy)),
      ...notes.filter((note) => own(note, note.editedBy)),
    ]
      .map((doc) => refOf(doc.calendar))
      .filter((id): id is string => Boolean(id))
  );
};

/**
 * The calendars a reminder names: the account's own with the reminder on,
 * that have no entry of the account on its day yet (`enteredIn`).
 */
export const openCalendars = <C extends { id: string }>({
  calendars,
  settings,
  entered,
}: {
  calendars: readonly C[];
  settings: PushSettingsDoc | null | undefined;
  /** The calendars with an entry of the account on the device's day. */
  entered: ReadonlySet<string>;
}): C[] =>
  calendars.filter(
    (calendar) =>
      switchesOf(settings, calendar.id).reminder && !entered.has(calendar.id)
  );

/**
 * One notification per person and calendar in a window: true when this one
 * goes out, false when one went out for the same key shortly before. Kept
 * in memory, like the live nudges (sync/live.ts) – one server process.
 */
export const createThrottle = (windowMs: number) => {
  const last = new Map<string, number>();
  return (key: string, now = Date.now()) => {
    // Old keys go as new ones come – the map stays as small as the window.
    for (const [k, at] of last) if (now - at >= windowMs) last.delete(k);
    if (last.has(key)) return false;
    last.set(key, now);
    return true;
  };
};
