// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { isLocale, type Locale } from "../../i18n/config";
import { dictionaryOf } from "../../i18n/dictionaries";

/**
 * Who hears of what, and when – plain functions of their arguments, tested
 * in test/push/rules.test.ts. The server's parts (stamped.ts, reminder.ts,
 * endpoints.ts) ask the database and hand them what it said.
 *
 * - Every account has two switches per calendar: the evening's reminder
 *   and “someone else stamped here”. Both are on until switched off – only
 *   what is off is kept (`PushSettingsDoc.calendars`).
 * - A device (`SubscriptionRow`) hears only as long as the login it was
 *   switched on in lasts: logged out, it is quiet.
 * - The reminder comes once a day per device, at the account's time on the
 *   device's clock – naming the calendars still without a print of its own.
 */

/** A calendar's two switches, for one account. */
export type Switches = { reminder: boolean; stamped: boolean };

export const DEFAULT_SWITCHES: Readonly<Switches> = {
  reminder: true,
  stamped: true,
};

/** The reminder's time when none is set – on the device's clock. */
export const DEFAULT_REMINDER_AT = "20:00";

/**
 * The latest reminder – the cron's last round of a day comes at 23:45 (it
 * runs every 15 minutes), anything later would never be due.
 */
export const LATEST_REMINDER_AT = "23:45";

/** A device's zone when it said none (or one this server doesn't know). */
export const DEFAULT_TIME_ZONE = "Europe/Berlin";

/**
 * Prints of one person in one calendar within this long are one
 * notification – a sticker spree is no ten pings.
 */
export const STAMPED_WINDOW_MS = 10 * 60 * 1000;

/** The account's settings as stored (collections.ts) – none: all default. */
export type PushSettingsDoc = {
  reminderAt?: string | null;
  calendars?:
    | {
        calendar?: unknown;
        reminder?: boolean | null;
        stamped?: boolean | null;
      }[]
    | null;
};

/** One entry of `PushSettingsDoc.calendars`, plain. */
export type CalendarEntry = { calendar: string } & Switches;

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

type Doc = Record<string, unknown>;

/** A relationship as an id, populated or not. */
export const refOf = (value: unknown): string | null => {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "id" in value) {
    return refOf((value as { id: unknown }).id);
  }
  return null;
};

// ── Time ────────────────────────────────────────────────────────────────────

/** "20:00" → 1200 minutes – or null for anything else. */
export const minutesOf = (time: unknown): number | null => {
  if (typeof time !== "string") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/** A reminder's time as kept: "HH:MM", at most 23:45 – or null. */
export const cleanReminderAt = (value: unknown): string | null => {
  const minutes = minutesOf(value);
  if (minutes === null) return null;
  return minutes > (minutesOf(LATEST_REMINDER_AT) ?? 0)
    ? LATEST_REMINDER_AT
    : (value as string);
};

/** The account's reminder time – its own, or 20:00. */
export const reminderAtOf = (settings: PushSettingsDoc | null | undefined) =>
  cleanReminderAt(settings?.reminderAt) ?? DEFAULT_REMINDER_AT;

/** A zone the server's clock knows, like "Europe/Berlin". */
export const isTimeZone = (value: unknown): value is string => {
  if (typeof value !== "string" || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/** The day and the minute of the day it is now in a zone. */
export const localClock = (
  timeZone: string,
  now: Date
): { day: string; minutes: number } => {
  const zone = isTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
};

/**
 * The device's day when its reminder is due now – its time reached, none
 * sent that day yet – or null.
 */
export const reminderDue = (
  device: Pick<SubscriptionRow, "timeZone" | "remindedOn">,
  reminderAt: string,
  now: Date
): string | null => {
  const { day, minutes } = localClock(device.timeZone, now);
  if (device.remindedOn === day) return null;
  return minutes >= (minutesOf(reminderAt) ?? Number.POSITIVE_INFINITY)
    ? day
    : null;
};

/** Seconds left of the device's day – a reminder is no use the day after. */
export const secondsLeftOfDay = (timeZone: string, now: Date) =>
  Math.max(60, (24 * 60 - localClock(timeZone, now).minutes) * 60);

// ── Switches ────────────────────────────────────────────────────────────────

/** The entries kept, plain – one per calendar, the last one counts. */
export const entriesOf = (
  settings: PushSettingsDoc | null | undefined
): CalendarEntry[] => {
  const byCalendar = new Map<string, CalendarEntry>();
  for (const entry of settings?.calendars ?? []) {
    const calendar = refOf(entry?.calendar);
    if (!calendar) continue;
    byCalendar.set(calendar, {
      calendar,
      reminder: entry.reminder !== false,
      stamped: entry.stamped !== false,
    });
  }
  return [...byCalendar.values()];
};

/** An account's switches for a calendar – on, unless switched off. */
export const switchesOf = (
  settings: PushSettingsDoc | null | undefined,
  calendar: string
): Switches => {
  const entry = entriesOf(settings).find((e) => e.calendar === calendar);
  return entry
    ? { reminder: entry.reminder, stamped: entry.stamped }
    : { ...DEFAULT_SWITCHES };
};

/**
 * The entries after a switch: the one calendar's changed, those of
 * calendars the account is no longer in dropped (deleted, left – nobody
 * tells the settings, so they tidy up whenever written), and one that is
 * all on again goes: that is the default.
 */
export const withSwitch = (
  settings: PushSettingsDoc | null | undefined,
  mine: ReadonlySet<string>,
  change?: { calendar: string } & Partial<Switches>
): CalendarEntry[] => {
  const entries = entriesOf(settings).filter((e) => mine.has(e.calendar));
  if (change && mine.has(change.calendar)) {
    const now = switchesOf({ calendars: entries }, change.calendar);
    const next: CalendarEntry = {
      calendar: change.calendar,
      reminder: change.reminder ?? now.reminder,
      stamped: change.stamped ?? now.stamped,
    };
    const rest = entries.filter((e) => e.calendar !== change.calendar);
    return next.reminder && next.stamped ? rest : [...rest, next];
  }
  return entries;
};

// ── Devices ─────────────────────────────────────────────────────────────────

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

/**
 * Who hears that someone stamped in a calendar: the devices of its other
 * members – never the stamper's own, also not their other devices – whose
 * account has the switch on, and whose login lasts.
 */
export const stampedTargets = ({
  calendar,
  members,
  by,
  devices,
  settings,
  sessions,
  now,
}: {
  calendar: string;
  members: readonly string[];
  by: string;
  devices: readonly SubscriptionRow[];
  /** The members' settings, by account. */
  settings: Record<string, PushSettingsDoc | undefined>;
  /** The members' logins, by account. */
  sessions: Record<string, readonly Session[] | undefined>;
  now: Date;
}): SubscriptionRow[] =>
  devices.filter(
    (device) =>
      device.account !== by &&
      members.includes(device.account) &&
      switchesOf(settings[device.account], calendar).stamped &&
      loginLasts(device, sessions[device.account], now)
  );

/**
 * The calendars a reminder names: the account's own with the reminder on,
 * that have no print of the account on its day yet.
 */
export const openCalendars = <C extends { id: string }>({
  calendars,
  settings,
  stamped,
}: {
  calendars: readonly C[];
  settings: PushSettingsDoc | null | undefined;
  /** The calendars with a print of the account on the device's day. */
  stamped: ReadonlySet<string>;
}): C[] =>
  calendars.filter(
    (calendar) =>
      switchesOf(settings, calendar.id).reminder && !stamped.has(calendar.id)
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

// ── Messages ────────────────────────────────────────────────────────────────

/**
 * What a notification shows – and nothing else: no token, no ids but the
 * calendar's (in its address). The service worker (public/sw-push.js)
 * shows it as it comes.
 */
export type PushMessage = {
  title: string;
  body: string;
  /** Where a tap leads – the calendar in the app. */
  url: string;
  /** One per calendar and kind on the device: a new one replaces it. */
  tag: string;
};

/** The calendar in the app – the app opens it by its id, too. */
export const calendarUrl = (locale: Locale, calendar: string) =>
  `/${locale}/app/${encodeURIComponent(calendar)}`;

/**
 * What a notification says. `t`: the texts – the server's callers pass the
 * CMS's (`getDictionary`, features/translations); without, the code's.
 */
export const stampedMessage = (
  locale: Locale,
  { name, calendar }: { name: string; calendar: { id: string; name: string } },
  t = dictionaryOf(locale).app.push
): PushMessage => {
  return {
    title: t.stampedTitle,
    body: t.stampedBody(name.trim() || t.someone, calendar.name),
    url: calendarUrl(locale, calendar.id),
    tag: `stamped-${calendar.id}`,
  };
};

export const reminderMessage = (
  locale: Locale,
  calendars: readonly { id: string; name: string }[],
  t = dictionaryOf(locale).app.push
): PushMessage => {
  return {
    title: t.reminderTitle,
    body: t.reminderBody(calendars.map((calendar) => calendar.name)),
    url: calendars[0] ? calendarUrl(locale, calendars[0].id) : `/${locale}/app`,
    tag: "reminder",
  };
};

// ── Push services ───────────────────────────────────────────────────────────

/**
 * The browsers' push services – the server only ever posts there. Any other
 * address a device names is refused: the server would post to it.
 */
const PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge on Android, Opera, Samsung
  "android.googleapis.com",
  "push.services.mozilla.com", // Firefox (updates.push.services.mozilla.com)
  "push.apple.com", // Safari (web.push.apple.com)
  "notify.windows.com", // Edge (wns2-….notify.windows.com)
];

/** A push service's address, from a browser that's one of them. */
export const isPushEndpoint = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 1024) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.port === "" || url.port === "443") &&
      PUSH_HOSTS.some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
      )
    );
  } catch {
    return false;
  }
};

/** The push service's name – what the export shows instead of the address. */
export const pushServiceOf = (endpoint: unknown) => {
  try {
    return new URL(String(endpoint)).hostname;
  } catch {
    return "";
  }
};

/** A subscription's key as browsers write it: base64url, short. */
export const isPushKey = (value: unknown, max: number): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= max &&
  /^[A-Za-z0-9_-]+=*$/.test(value);
