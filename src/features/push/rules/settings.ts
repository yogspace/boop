/**
 * An account's switches as stored – per calendar, and its two of its own –
 * read plain, and written back with only what differs from the defaults.
 */

/** A calendar's three switches, for one account. */
export type Switches = {
  reminder: boolean;
  stamped: boolean;
  changed: boolean;
};

export const DEFAULT_SWITCHES: Readonly<Switches> = {
  reminder: true,
  stamped: true,
  changed: false,
};

/**
 * The account's settings as stored (push/collections.ts) – none: all
 * default.
 */
export type PushSettingsDoc = {
  reminderAt?: string | null;
  /** “Someone invites me to a calendar” – kept only when off. */
  invited?: boolean | null;
  /** “Boop gives me a stamp” (features/cards) – kept only when off. */
  gifts?: boolean | null;
  calendars?:
    | {
        calendar?: unknown;
        reminder?: boolean | null;
        stamped?: boolean | null;
        changed?: boolean | null;
      }[]
    | null;
};

/** One entry of `PushSettingsDoc.calendars`, plain. */
export type CalendarEntry = { calendar: string } & Switches;

/** A document as the database hands it. */
export type Doc = Record<string, unknown>;

/** A relationship as an id, populated or not. */
export const refOf = (value: unknown): string | null => {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "id" in value) {
    return refOf((value as { id: unknown }).id);
  }
  return null;
};

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
      // Kept from before there was this switch: off.
      changed: entry.changed === true,
    });
  }
  return [...byCalendar.values()];
};

/** An account's switches for a calendar – as by default, unless switched. */
export const switchesOf = (
  settings: PushSettingsDoc | null | undefined,
  calendar: string
): Switches => {
  const entry = entriesOf(settings).find((e) => e.calendar === calendar);
  return entry
    ? {
        reminder: entry.reminder,
        stamped: entry.stamped,
        changed: entry.changed,
      }
    : { ...DEFAULT_SWITCHES };
};

const isDefault = (switches: Switches) =>
  (Object.keys(DEFAULT_SWITCHES) as (keyof Switches)[]).every(
    (key) => switches[key] === DEFAULT_SWITCHES[key]
  );

/**
 * The entries after a switch: the one calendar's changed, those of
 * calendars the account is no longer in dropped (deleted, left – nobody
 * tells the settings, so they tidy up whenever written), and one that is
 * back to the defaults goes.
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
      changed: change.changed ?? now.changed,
    };
    const rest = entries.filter((e) => e.calendar !== change.calendar);
    return isDefault(next) ? rest : [...rest, next];
  }
  return entries;
};

/**
 * The account's own switch, “someone invites me to a calendar”: on until
 * switched off – whatever is kept that is no off counts as on.
 */
export const invitedOf = (settings: PushSettingsDoc | null | undefined) =>
  settings?.invited !== false;

/**
 * That switch as kept after a change – or as it was, without one. Only an
 * off is kept: on is the default and leaves nothing (null), like a
 * calendar's entry back at its defaults.
 */
export const withInvited = (
  settings: PushSettingsDoc | null | undefined,
  change?: boolean
): false | null => ((change ?? invitedOf(settings)) ? null : false);

/** The other switch of its own, “Boop gives me a stamp” – like that one. */
export const giftsOf = (settings: PushSettingsDoc | null | undefined) =>
  settings?.gifts !== false;

/** That switch as kept after a change – only an off is kept. */
export const withGifts = (
  settings: PushSettingsDoc | null | undefined,
  change?: boolean
): false | null => ((change ?? giftsOf(settings)) ? null : false);
