"use client";

import { useSnapshot } from "valtio";
import type { CalendarPrefs, CalendarView } from "@/features/calendar/prefs";
import * as calendars from "./store/calendars";
import * as invitations from "./store/invitations";
import { type Local, newLocal } from "./store/local";
import * as notes from "./store/notes";
import * as placements from "./store/placements";
import * as prefs from "./store/prefs";
import * as session from "./store/session";
import * as stamps from "./store/stamps";
import * as syncing from "./store/sync";

/**
 * The app's data on this device – local first, in one store (valtio). Every
 * change is made here at once (and kept in IndexedDB), and noted in the
 * outbox; the sync sends the outbox to the server and takes over what changed
 * elsewhere. Offline the outbox simply waits.
 *
 *   const { calendars } = useBoop();   // in components
 *   placeStamp(…);                     // changes – the actions below
 *
 * Its parts are in store/: what they share (local.ts), how a change is made
 * (changes.ts), the actions per kind (calendars, stamps, placements, notes,
 * prefs, invitations), the sync (sync.ts, merge.ts) and the store's life on
 * the page (session.ts). Here the page's one store is made, and the app gets
 * the actions on it.
 */

export type { BoopState } from "./store/local";
export { colorOf, prefOf } from "./store/prefs";
export type { StampChange } from "./store/stamps";

// What someone set for a calendar for themselves alone – its color, the
// view it opens in (calendar/prefs.ts) – and the views. See store/prefs.ts.
export type { CalendarPrefs, CalendarView };

// In development a saved file can swap this module into a running page: the
// new store would stay empty (nothing starts it again), beside the old one
// still syncing. The page starts over instead. Every part of the store is
// imported here, so a part saved (or anything a part uses) comes here too.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  const page = window as { boopStore?: true };
  if (page.boopStore) window.location.reload();
  page.boopStore = true;
}

/** The page's one store – what it shows, and what its parts keep. */
const local = newLocal();

export const boop = local.boop;

/** The store's snapshot – re-renders on what the component reads. */
export const useBoop = () => useSnapshot(boop);

/** A part's function on the page's store – as the app calls it. */
const onStore =
  <Args extends unknown[], Result>(
    run: (local: Local, ...args: Args) => Result
  ) =>
  (...args: Args): Result =>
    run(local, ...args);

// The store's life on the page, and the sync.
export const start = onStore(session.start);
export const signedIn = onStore(session.signedIn);
export const logout = onStore(session.logout);
export const sync = onStore(syncing.sync);

// The actions per kind – each told of in its part.
export const createCalendar = onStore(calendars.createCalendar);
export const renameCalendar = onStore(calendars.renameCalendar);
export const deleteCalendar = onStore(calendars.deleteCalendar);

export const createStamp = onStore(stamps.createStamp);
export const shareStamp = onStore(stamps.shareStamp);
export const renameStamp = onStore(stamps.renameStamp);
export const updateStamp = onStore(stamps.updateStamp);
export const deleteStamp = onStore(stamps.deleteStamp);

export const placeStamp = onStore(placements.placeStamp);
export const restorePlacement = onStore(placements.restorePlacement);
export const movePlacement = onStore(placements.movePlacement);
export const removePlacement = onStore(placements.removePlacement);

export const setNote = onStore(notes.setNote);

export const setCalendarPref = onStore(prefs.setCalendarPref);

export const acceptInvitation = onStore(invitations.acceptInvitation);
export const declineInvitation = onStore(invitations.declineInvitation);
