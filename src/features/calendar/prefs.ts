// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { nameId } from "../../lib/id";
import type { Change } from "../sync/protocol";
import type { ColorName } from "./model";
import { isColorKey } from "./palette";

/**
 * One's own settings for a calendar – how someone sees it, not what it is:
 * their color for it, the view it opens in. Each person sets them for
 * themselves (the calendar's settings, “Just for you”), and they are the
 * account's: kept on the server (collections/prefs.ts) and synced like the
 * rest, so a calendar turned yellow on the phone is yellow on the laptop
 * too. The same on the server (sync/apply.ts, pull.ts) and in the app
 * (offline/store/prefs.ts). No server imports here.
 *
 * One per account and calendar: its id is made of the two (`prefId`), as a
 * day's note's is of its day – set on two devices at once, it is still one,
 * and the later change wins. They go with the calendar, when the account
 * leaves it, and with the account.
 *
 * Only these two travel. What else a device remembers for itself – how the
 * shelf is sorted, which gifts it has shown – stays on it.
 */

/** How a calendar shows: today's page, the month, or the whole year. */
export type CalendarView = "today" | "month" | "year";

export const CALENDAR_VIEWS = [
  "today",
  "month",
  "year",
] as const satisfies readonly CalendarView[];

export const isCalendarView = (value: unknown): value is CalendarView =>
  CALENDAR_VIEWS.includes(value as CalendarView);

export type CalendarPrefs = {
  /** Their own color for it – none: the calendar's. */
  color?: ColorName;
  /**
   * The view it opens in (its settings) – none: the month. Switching views
   * leaves it be: that is in the address only (app/address.ts `viewShown`).
   */
  start?: CalendarView;
};

/** One's own settings for a calendar, as the sync carries them. */
export type PrefDoc = {
  /** `prefId` of account and calendar. */
  id: string;
  calendar: string;
  /** null: none set – the calendar's color, the month. */
  color: ColorName | null;
  start: CalendarView | null;
  changedAt: string;
  deleted: boolean;
};

/**
 * The id of an account's settings for a calendar – the same on every
 * device: a name-based UUID (`nameId`, lib/id.ts) of the account, in the
 * calendar's id as its namespace. (A day's note is named by its day in the
 * same namespace – “2026-10-16” is never “prefs:…”.)
 */
export const prefId = (account: string, calendar: string): string =>
  nameId(calendar, `prefs:${account}`);

/**
 * Settings as they came – from the server, a device's copy, one from before
 * – with only what they hold, each checked: a color's key (by its form,
 * palette.ts), a view. Anything else goes – `view`, say, which a calendar
 * opened in before it had a start view of its own.
 */
export const cleanPrefs = (value: unknown): CalendarPrefs => {
  const { color, start } = (value ?? {}) as Record<string, unknown>;
  return {
    ...(isColorKey(color) && { color }),
    ...(isCalendarView(start) && { start }),
  };
};

/** Nothing set: the calendar as it is. */
export const isEmptyPrefs = (prefs: CalendarPrefs) =>
  !(prefs.color || prefs.start);

/** What a device sends of its settings for a calendar: both, set or not. */
export const prefData = (calendar: string, prefs: CalendarPrefs) => ({
  calendar,
  color: prefs.color ?? null,
  start: prefs.start ?? null,
});

/**
 * As old as can be: settings a device kept from before they were the
 * account's go to the server with this time – so whatever the server has
 * for that calendar already (another device's, sent before) is the later
 * change and stays (sync/apply.ts). Only where it has none, it takes them.
 */
export const LONG_AGO = new Date(0).toISOString();

/**
 * A device's settings from before, as changes for the sync – once, after
 * the update: per calendar still on the device (`here`), as old as can be
 * (`LONG_AGO`). None for one without anything set.
 */
export const oldPrefChanges = (
  account: string,
  prefs: Readonly<Record<string, unknown>>,
  here: (calendar: string) => boolean
): Change[] =>
  Object.entries(prefs).flatMap(([calendar, value]) => {
    const kept = cleanPrefs(value);
    if (!here(calendar) || isEmptyPrefs(kept)) return [];
    return [
      {
        type: "pref",
        id: prefId(account, calendar),
        changedAt: LONG_AGO,
        data: prefData(calendar, kept),
      } satisfies Change,
    ];
  });
