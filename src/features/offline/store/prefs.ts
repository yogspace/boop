import type { Snapshot } from "valtio";
import type { ColorName } from "@/features/calendar/model";
import {
  type CalendarPrefs,
  cleanPrefs,
  isEmptyPrefs,
  oldPrefChanges,
  type PrefDoc,
  prefData,
  prefId,
} from "@/features/calendar/prefs";
import { shownColor } from "@/features/calendar/tint";
import { getMeta, type Op, write } from "../db";
import { enqueue, now, plain, waiting } from "./changes";
import type { BoopState, Local } from "./local";

/**
 * What the account set for a calendar for itself alone (`CalendarPrefs`,
 * calendar/prefs.ts) is the account's: kept on the server and synced like
 * the rest – its own type of change (“pref”), one per calendar, its id made
 * of account and calendar (`prefId`), the later change wins. On the device
 * they are in the store's `prefs`, by calendar, and in IndexedDB (`meta`,
 * under `PREFS`) – loaded with the rest (`start`, store/session.ts), there
 * offline too, gone with the device's copy (logout, another account logging
 * in) and with a calendar that leaves the device (`tidyPrefs`); the server
 * drops its own then (sync/apply.ts, calendar/endpoints/members.ts).
 *
 * Besides that loading and clearing, nothing but the functions here
 * touches `boop.prefs` or its `meta` entry: `prefOf` and `colorOf` read,
 * `setCalendarPref` writes, `takePrefs` takes over the server's.
 */
export const PREFS = "prefs";

/**
 * Set once this device has sent the settings it kept for itself from
 * before they were the account's (`sendOldPrefs`).
 */
const PREFS_SENT = "prefsSent";

/** The store as a component has it (`useBoop()`) – or the store itself. */
type WithPrefs = Snapshot<Pick<BoopState, "prefs">>;

const NO_PREFS: Readonly<CalendarPrefs> = {};

/**
 * The account's own settings for a calendar – none yet: an empty one. Hand
 * it the store from `useBoop()`, so the component draws anew when they
 * change.
 */
export const prefOf = (
  state: WithPrefs,
  calendar: string
): Readonly<CalendarPrefs> => state.prefs[calendar] ?? NO_PREFS;

/**
 * The color the account sees a calendar in – everywhere it shows: its own
 * for it, else the calendar's (`shownColor`, calendar/tint.ts).
 */
export const colorOf = (
  state: WithPrefs,
  calendar: { id: string; color: ColorName }
): ColorName => shownColor(calendar, prefOf(state, calendar.id).color);

/** The settings as they are now, for IndexedDB. */
const savePrefs = (local: Local): Op => ({
  store: "meta",
  put: plain(local.boop.prefs),
  key: PREFS,
});

/** A calendar's settings here – none left: none at all. */
const putPrefs = (local: Local, calendar: string, prefs: CalendarPrefs) => {
  if (isEmptyPrefs(prefs)) delete local.boop.prefs[calendar];
  else local.boop.prefs[calendar] = prefs;
};

/**
 * Sets some of the account's own settings for a calendar – `null` takes one
 * back. At once, like every change here, and on its way to the account's
 * other devices. Anything else a device kept from before goes with it
 * (`cleanPrefs`).
 */
export const setCalendarPref = async (
  local: Local,
  id: string,
  patch: { [K in keyof CalendarPrefs]?: CalendarPrefs[K] | null }
) => {
  const { boop } = local;
  const account = boop.me?.id;
  if (!(account && boop.calendars[id])) return;
  const next = cleanPrefs({ ...boop.prefs[id], ...patch });
  if (JSON.stringify(next) === JSON.stringify(cleanPrefs(boop.prefs[id]))) {
    return;
  }
  putPrefs(local, id, next);
  const changedAt = now();
  await write([savePrefs(local)]);
  await enqueue(local, {
    type: "pref",
    id: prefId(account, id),
    changedAt,
    data: prefData(id, next),
  });
};

/**
 * The server's copies of the account's settings – unless changed here since
 * (still waiting to be sent). Its IndexedDB write, if anything came.
 */
export const takePrefs = (local: Local, incoming: PrefDoc[]): Op[] => {
  const account = local.boop.me?.id;
  let taken = false;
  for (const doc of incoming) {
    if (!account || doc.id !== prefId(account, doc.calendar)) continue;
    if (waiting(local, "pref", doc.id)) continue;
    putPrefs(local, doc.calendar, doc.deleted ? {} : cleanPrefs(doc));
    taken = true;
  }
  return taken ? [savePrefs(local)] : [];
};

/**
 * Once, after the update that made them the account's: the settings this
 * device kept for itself go to the server – as old as can be (`LONG_AGO`,
 * calendar/prefs.ts), so the server keeps what another device sent before,
 * and takes these only where it has nothing for that calendar. They wait in
 * the outbox like any change, offline too.
 */
export const sendOldPrefs = async (local: Local) => {
  const { boop } = local;
  const account = boop.me?.id;
  if (!account || (await getMeta<boolean>(PREFS_SENT))) return;
  const changes = oldPrefChanges(account, plain(boop.prefs), (calendar) =>
    Boolean(boop.calendars[calendar])
  );
  for (const change of changes) await enqueue(local, change);
  await write([{ store: "meta", put: true, key: PREFS_SENT }]);
};

/** No settings stay for a calendar that is off this device. */
export const tidyPrefs = (local: Local): Op[] => {
  const { boop } = local;
  const gone = Object.keys(boop.prefs).filter((id) => !boop.calendars[id]);
  if (!gone.length) return [];
  for (const id of gone) delete boop.prefs[id];
  return [savePrefs(local)];
};
