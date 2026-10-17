import {
  fetchMe,
  logout as logoutRequest,
  type Me,
  sessionOver,
} from "@/features/accounts/client";
import {
  type CalendarDoc,
  type KeptStampDoc,
  type NoteDoc,
  type PlacementDoc,
  stampDoc,
} from "@/features/calendar/model";
import type { CalendarPrefs } from "@/features/calendar/prefs";
import type { InvitationDoc } from "@/features/sync/protocol";
import { clearAll, getAll, getMeta, write } from "../db";
import { INVITATIONS } from "./invitations";
import { type Docs, type Local, type OutboxEntry, set } from "./local";
import { PREFS, sendOldPrefs } from "./prefs";
import { scheduleSync, sync } from "./sync";

/**
 * The store's life on the page: the device's copy opened (`start`), the
 * account that logs in (`signedIn`), the live line to the server, and the
 * logout that clears it all.
 */

const byId = <T extends { id: string }>(docs: T[]) =>
  Object.fromEntries(docs.map((doc) => [doc.id, doc]));

/** Opens the device's copy, then syncs – call once when the app mounts. */
export const start = async (local: Local) => {
  if (local.started) return;
  local.started = true;
  // The last login here was for one browser session, and that is over
  // (accounts/client.ts): what it left on this device goes before any of it
  // is read – calendars, stamps, prints, the outbox and all of `meta` (who,
  // since when, the own settings). What follows finds a device without an
  // account, and takes the usual way to the login.
  if (sessionOver()) await clearAll();
  const [
    calendars,
    stamps,
    placements,
    notes,
    entries,
    me,
    people,
    savedSince,
    savedKnown,
    prefs,
    invitations,
  ] = await Promise.all([
    getAll<CalendarDoc>("calendars"),
    getAll<KeptStampDoc>("stamps"),
    getAll<PlacementDoc>("placements"),
    getAll<NoteDoc>("notes"),
    getAll<OutboxEntry>("outbox"),
    getMeta<Me>("me"),
    getMeta<Record<string, string>>("people"),
    getMeta<string>("since"),
    getMeta<string[]>("known"),
    getMeta<Docs<CalendarPrefs>>(PREFS),
    getMeta<InvitationDoc[]>(INVITATIONS),
  ]);
  local.outbox = entries.sort((a, b) => a.seq - b.seq);
  local.since = savedSince ?? null;
  local.known = savedKnown ?? [];
  const online = navigator.onLine;
  // Kept by an app from before, a stamp still names its one `calendar` –
  // from here on it has `sharedWith`, on the device too. (Should that not
  // get written, no harm: it is read the same way next time.)
  const old = stamps.filter((stamp) => "calendar" in stamp);
  await write(
    old.map((stamp) => ({ store: "stamps", put: stampDoc(stamp) }))
  ).catch(() => undefined);
  set(local, {
    online,
    calendars: byId(calendars),
    stamps: byId(stamps.map(stampDoc)),
    placements: byId(placements),
    notes: byId(notes),
    people: people ?? {},
    prefs: prefs ?? {},
    invitations: invitations ?? [],
    me: me ?? null,
  });

  window.addEventListener("online", () => {
    set(local, { online: true });
    live(local);
    void sync(local);
  });
  window.addEventListener("offline", () => set(local, { online: false }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void sync(local);
  });
  window.addEventListener("focus", () => void sync(local));
  // Live nudges bring others' changes at once (`live`); this is the net
  // below them.
  setInterval(() => {
    if (document.visibilityState === "visible") void sync(local);
  }, 30_000);

  if (me) {
    // Known on this device: show at once, sync behind.
    set(local, { status: "ready" });
    live(local);
    await sendOldPrefs(local).catch(() => undefined);
    void sync(local);
    return;
  }
  if (!online) {
    set(local, { status: "offlineNoAccount" });
    return;
  }
  const account = await fetchMe().catch(() => null);
  if (!account) {
    set(local, { status: "signedOut" });
    return;
  }
  await signedIn(local, account);
};

/**
 * After a login: another account than the one on this device? Then the
 * device's copy goes first – nobody sees someone else's calendars.
 */
export const signedIn = async (local: Local, account: Me) => {
  const stored = await getMeta<Me>("me");
  if (stored && stored.id !== account.id) {
    await clearAll();
    local.outbox = [];
    local.since = null;
    local.known = [];
    local.answered.clear();
    set(local, {
      calendars: {},
      stamps: {},
      placements: {},
      notes: {},
      people: {},
      prefs: {},
      invitations: [],
    });
  }
  await write([{ store: "meta", put: account, key: "me" }]);
  set(local, { me: account, status: "ready" });
  live(local);
  await sendOldPrefs(local).catch(() => undefined);
  void sync(local);
};

/**
 * The live line to the server (features/sync/live.ts): a nudge whenever
 * something changes in one of the account's calendars – then sync at once.
 * The browser reconnects by itself after a drop.
 */
const live = (local: Local) => {
  if (local.source || typeof EventSource === "undefined") return;
  const source = new EventSource("/api/sync/live", { withCredentials: true });
  local.source = source;
  source.addEventListener("change", () => scheduleSync(local, 120));
  source.onerror = () => {
    // Logged out – no point in knocking again.
    if (local.boop.status === "signedOut") {
      local.source?.close();
      local.source = null;
    }
  };
};

/** Logs out and clears this device's copy. Needs a connection. */
export const logout = async (local: Local) => {
  const ok = await logoutRequest();
  if (!ok) return false;
  local.source?.close();
  local.source = null;
  await clearAll();
  local.outbox = [];
  local.since = null;
  local.known = [];
  local.answered.clear();
  set(local, {
    status: "signedOut",
    me: null,
    calendars: {},
    stamps: {},
    placements: {},
    notes: {},
    people: {},
    prefs: {},
    invitations: [],
  });
  return true;
};
