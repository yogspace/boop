"use client";

import { proxy, type Snapshot, useSnapshot } from "valtio";
import {
  fetchMe,
  logout as logoutRequest,
  type Me,
  sessionOver,
} from "@/features/accounts/client";
import {
  type CalendarDoc,
  type ColorName,
  type DayKey,
  type Drawing,
  type KeptStampDoc,
  type NoteContent,
  type NoteDoc,
  type PlacementDoc,
  type StampDoc,
  type StampShape,
  stampDoc,
} from "@/features/calendar/model";
import { cleanNote, noteId, sameNote } from "@/features/calendar/note";
import { shownColor } from "@/features/calendar/tint";
import type {
  Change,
  InvitationDoc,
  SyncRequest,
  SyncResponse,
  SyncType,
} from "@/features/sync/protocol";
import { MAX_CHANGES } from "@/features/sync/protocol";
import { newId } from "@/lib/id";
import { clearAll, getAll, getMeta, type Op, write } from "./db";

/**
 * The app's data on this device – local first, in one store (valtio). Every
 * change is made here at once (and kept in IndexedDB), and noted in the
 * outbox; the sync sends the outbox to the server and takes over what changed
 * elsewhere. Offline the outbox simply waits.
 *
 *   const { calendars } = useSnapshot(boop);   // in components
 *   placeStamp(…);                             // changes – the actions below
 */

type Docs<T> = Record<string, T>;

type OutboxEntry = { seq: number; change: Change };

/**
 * What someone set for a calendar for themselves alone – how they see it,
 * not what it is. Its color, the view it opens in; to come: its
 * notifications. See “Own settings” below.
 */
export type CalendarPrefs = {
  /** Their own color for it – none: the calendar's. */
  color?: ColorName;
  /** The view it opens in – none: today. */
  view?: CalendarView;
};

/** How a calendar shows: today's page, the month, or the whole year. */
export type CalendarView = "today" | "month" | "year";

export type BoopState = {
  status: "loading" | "ready" | "signedOut" | "offlineNoAccount";
  me: Me | null;
  online: boolean;
  syncing: boolean;
  /** Changes not yet on the server. */
  pending: number;
  calendars: Docs<CalendarDoc>;
  stamps: Docs<StampDoc>;
  placements: Docs<PlacementDoc>;
  /** The days' notes, by id (`noteId` – of calendar and day). */
  notes: Docs<NoteDoc>;
  /** Names of the people in the account's calendars, by id. */
  people: Record<string, string>;
  /**
   * The account's own settings per calendar, by its id – read with `prefOf`
   * and `colorOf`, never directly (“Own settings” below).
   */
  prefs: Docs<CalendarPrefs>;
  /** Open invitations to the account, oldest first (“Invitations” below). */
  invitations: InvitationDoc[];
};

const KIND = {
  calendar: "calendars",
  stamp: "stamps",
  placement: "placements",
  note: "notes",
} as const satisfies Record<SyncType, string>;

// In development a saved file can swap this module into a running page: the
// new store would stay empty (nothing starts it again), beside the old one
// still syncing. The page starts over instead.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  const page = window as { boopStore?: true };
  if (page.boopStore) window.location.reload();
  page.boopStore = true;
}

export const boop = proxy<BoopState>({
  status: "loading",
  me: null,
  online: true,
  syncing: false,
  pending: 0,
  calendars: {},
  stamps: {},
  placements: {},
  notes: {},
  people: {},
  prefs: {},
  invitations: [],
});

let outbox: OutboxEntry[] = [];
/** Sequence numbers of the entries on their way to the server right now. */
const inFlight = new Set<number>();
let since: string | null = null;
let known: string[] = [];

const set = (patch: Partial<BoopState>) => {
  Object.assign(boop, patch);
  boop.pending = outbox.length;
};

/** The store's snapshot – re-renders on what the component reads. */
export const useBoop = () => useSnapshot(boop);

// ── Loading ─────────────────────────────────────────────────────────────────

const byId = <T extends { id: string }>(docs: T[]) =>
  Object.fromEntries(docs.map((doc) => [doc.id, doc]));

let started = false;

/** Opens the device's copy, then syncs – call once when the app mounts. */
export const start = async () => {
  if (started) return;
  started = true;
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
  outbox = entries.sort((a, b) => a.seq - b.seq);
  since = savedSince ?? null;
  known = savedKnown ?? [];
  const online = navigator.onLine;
  // Kept by an app from before, a stamp still names its one `calendar` –
  // from here on it has `sharedWith`, on the device too. (Should that not
  // get written, no harm: it is read the same way next time.)
  const old = stamps.filter((stamp) => "calendar" in stamp);
  await write(
    old.map((stamp) => ({ store: "stamps", put: stampDoc(stamp) }))
  ).catch(() => undefined);
  set({
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
    set({ online: true });
    live();
    void sync();
  });
  window.addEventListener("offline", () => set({ online: false }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void sync();
  });
  window.addEventListener("focus", () => void sync());
  // Live nudges bring others' changes at once (live()); this is the net
  // below them.
  setInterval(() => {
    if (document.visibilityState === "visible") void sync();
  }, 30_000);

  if (me) {
    // Known on this device: show at once, sync behind.
    set({ status: "ready" });
    live();
    void sync();
    return;
  }
  if (!online) {
    set({ status: "offlineNoAccount" });
    return;
  }
  const account = await fetchMe().catch(() => null);
  if (!account) {
    set({ status: "signedOut" });
    return;
  }
  await signedIn(account);
};

/**
 * After a login: another account than the one on this device? Then the
 * device's copy goes first – nobody sees someone else's calendars.
 */
export const signedIn = async (account: Me) => {
  const stored = await getMeta<Me>("me");
  if (stored && stored.id !== account.id) {
    await clearAll();
    outbox = [];
    since = null;
    known = [];
    answered.clear();
    set({
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
  set({ me: account, status: "ready" });
  live();
  void sync();
};

let source: EventSource | null = null;

/**
 * The live line to the server (features/sync/live.ts): a nudge whenever
 * something changes in one of the account's calendars – then sync at once.
 * The browser reconnects by itself after a drop.
 */
const live = () => {
  if (source || typeof EventSource === "undefined") return;
  source = new EventSource("/api/sync/live", { withCredentials: true });
  source.addEventListener("change", () => scheduleSync(120));
  source.onerror = () => {
    // Logged out – no point in knocking again.
    if (boop.status === "signedOut") {
      source?.close();
      source = null;
    }
  };
};

// ── Changes ─────────────────────────────────────────────────────────────────

let nextSeq = 0;

/**
 * Notes a change in the outbox. One still waiting for the same document
 * takes the new fields in – the server gets one change, not ten. Deleted
 * stays deleted – but a day's note, emptied and written again, is the same
 * note (its id is the day's): its last word counts.
 */
const enqueue = async (change: Change) => {
  const waiting = outbox.find(
    (entry) =>
      !inFlight.has(entry.seq) &&
      entry.change.type === change.type &&
      entry.change.id === change.id
  );
  let entry: OutboxEntry;
  if (waiting) {
    waiting.change = {
      ...waiting.change,
      changedAt: change.changedAt,
      deleted:
        change.type === "note"
          ? change.deleted
          : change.deleted || waiting.change.deleted,
      data: { ...waiting.change.data, ...change.data },
    };
    entry = waiting;
  } else {
    nextSeq = Math.max(nextSeq, Date.now(), (outbox.at(-1)?.seq ?? 0) + 1);
    entry = { seq: nextSeq++, change };
    outbox.push(entry);
  }
  await write([{ store: "outbox", put: plain(entry) }]);
  scheduleSync();
};

/** Puts a document into the device's copy and the boop. */
/**
 * A plain copy for IndexedDB. Objects put into the store become valtio
 * proxies (also nested ones, like a stamp's drawing) – and IndexedDB can't
 * store a proxy. The data is plain JSON, so a JSON copy is exact.
 */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const keep = async <T extends { id: string; deleted: boolean }>(
  type: SyncType,
  doc: T
) => {
  const kind = KIND[type];
  const record = plain(doc);
  const docs = boop[kind] as unknown as Docs<T>;
  if (doc.deleted) delete docs[doc.id];
  else docs[doc.id] = doc;
  await write([
    doc.deleted
      ? { store: kind, delete: doc.id }
      : { store: kind, put: record },
  ]);
};

const now = () => new Date().toISOString();

const me = () => {
  if (!boop.me) throw new Error("Not logged in");
  return boop.me.id;
};

export const createCalendar = async (name: string, color: ColorName) => {
  const doc: CalendarDoc = {
    id: newId(),
    name,
    color,
    owner: me(),
    members: [me()],
    personal: false,
    changedAt: now(),
    deleted: false,
  };
  await keep("calendar", doc);
  await enqueue({
    type: "calendar",
    id: doc.id,
    changedAt: doc.changedAt,
    data: { name, color },
  });
  return doc.id;
};

export const renameCalendar = async (
  id: string,
  name: string,
  color?: ColorName
) => {
  const doc = boop.calendars[id];
  if (!doc) return;
  const changedAt = now();
  await keep("calendar", {
    ...plain(doc),
    name,
    ...(color && { color }),
    changedAt,
  });
  await enqueue({
    type: "calendar",
    id,
    changedAt,
    data: { name, ...(color && { color }) },
  });
};

export const deleteCalendar = async (id: string) => {
  const doc = boop.calendars[id];
  if (!doc) return;
  const changedAt = now();
  await dropCalendar(id);
  await enqueue({ type: "calendar", id, changedAt, deleted: true });
};

export const createStamp = async (stamp: {
  name: string;
  color: ColorName;
  shape: StampShape;
  drawing: Drawing;
  /** Calendars whose members may stamp with it too – none: just me. */
  sharedWith: string[];
}) => {
  const doc: StampDoc = {
    id: newId(),
    ...stamp,
    owner: me(),
    changedAt: now(),
    deleted: false,
  };
  await keep("stamp", doc);
  await enqueue({
    type: "stamp",
    id: doc.id,
    changedAt: doc.changedAt,
    data: { ...stamp },
  });
  return doc.id;
};

/**
 * Who else may stamp with a stamp: the members of these calendars (none:
 * nobody). Its owner's call – the stamp stays theirs either way.
 */
export const shareStamp = async (id: string, sharedWith: string[]) => {
  const doc = boop.stamps[id];
  if (!doc || doc.owner !== boop.me?.id) return;
  const changedAt = now();
  await keep("stamp", { ...plain(doc), sharedWith, changedAt });
  await enqueue({ type: "stamp", id, changedAt, data: { sharedWith } });
};

/** A stamp's name – or none (""). Its owner's call, like the sharing. */
export const renameStamp = async (id: string, name: string) => {
  const doc = boop.stamps[id];
  if (!doc || doc.owner !== boop.me?.id) return;
  const changedAt = now();
  await keep("stamp", { ...plain(doc), name, changedAt });
  await enqueue({ type: "stamp", id, changedAt, data: { name } });
};

export const deleteStamp = async (id: string) => {
  const doc = boop.stamps[id];
  if (!doc) return;
  const changedAt = now();
  await keep("stamp", { ...plain(doc), deleted: true, changedAt });
  // Its prints go along – the server removes them for everyone else.
  const ops: Op[] = [];
  for (const p of Object.values(boop.placements)) {
    if (p.stamp === id) {
      delete boop.placements[p.id];
      ops.push({ store: "placements", delete: p.id });
    }
  }
  await write(ops);
  await enqueue({ type: "stamp", id, changedAt, deleted: true });
};

export const placeStamp = async ({
  id = newId(),
  scale = 1,
  z,
  ...placement
}: {
  /** Made ahead by whoever previews the print (its look comes from its id). */
  id?: string;
  calendar: string;
  date: DayKey;
  stamp: string;
  x: number;
  y: number;
  rotation: number;
  ink: ColorName | null;
  /** Its size and its place in the stack – new prints go on top. */
  scale?: number;
  z?: number;
}) => {
  const top =
    Math.max(
      0,
      ...Object.values(boop.placements)
        .filter(
          (p) => p.calendar === placement.calendar && p.date === placement.date
        )
        .map((p) => p.z)
    ) + 1;
  const doc: PlacementDoc = {
    id,
    ...placement,
    scale,
    z: z ?? top,
    placedBy: me(),
    changedAt: now(),
    deleted: false,
  };
  await keep("placement", doc);
  await enqueue({
    type: "placement",
    id,
    changedAt: doc.changedAt,
    data: { ...placement, scale, z: doc.z },
  });
  return id;
};

/**
 * A removed print back where it was (undo) – as a new one, with a new id:
 * the server never brings a deleted document back (sync/apply.ts), and the
 * outbox keeps `deleted` once it is set. Returns the new id.
 */
export const restorePlacement = (
  print: Pick<
    PlacementDoc,
    | "calendar"
    | "date"
    | "stamp"
    | "x"
    | "y"
    | "rotation"
    | "scale"
    | "z"
    | "ink"
  >
) =>
  placeStamp({
    calendar: print.calendar,
    date: print.date,
    stamp: print.stamp,
    x: print.x,
    y: print.y,
    rotation: print.rotation,
    scale: print.scale,
    z: print.z,
    ink: print.ink,
  });

export const movePlacement = async (
  id: string,
  patch: Partial<Pick<PlacementDoc, "x" | "y" | "rotation" | "scale" | "z">>
) => {
  const doc = boop.placements[id];
  if (!doc) return;
  const changedAt = now();
  await keep("placement", { ...doc, ...patch, changedAt });
  await enqueue({ type: "placement", id, changedAt, data: patch });
};

export const removePlacement = async (id: string) => {
  const doc = boop.placements[id];
  if (!doc) return;
  const changedAt = now();
  await keep("placement", { ...doc, deleted: true, changedAt });
  await enqueue({ type: "placement", id, changedAt, deleted: true });
};

/**
 * A day's note, as it is now – written by any member of its calendar.
 * Nothing left once checked (`cleanNote`) and it is deleted; the same as
 * before, and nothing happens. It is the day's (`noteId`): the same day on
 * another device is the same note, and whoever writes last has it.
 */
export const setNote = async (
  calendar: string,
  date: DayKey,
  content: NoteContent | null
) => {
  if (!boop.calendars[calendar]) return;
  const id = noteId(calendar, date);
  const clean = cleanNote(content);
  if (sameNote(boop.notes[id]?.content, clean)) return;
  const changedAt = now();
  await keep("note", {
    id,
    calendar,
    date,
    content: clean,
    editedBy: clean ? me() : "",
    changedAt,
    deleted: !clean,
  } satisfies NoteDoc);
  await enqueue({
    type: "note",
    id,
    changedAt,
    deleted: !clean,
    data: clean ? { calendar, date, content: plain(clean) } : undefined,
  });
};

/**
 * A calendar off this device – with its placements and notes. The stamps
 * follow (`tidyStamps`): mine all stay.
 */
const dropCalendar = async (id: string) => {
  const { calendars } = boop;
  delete calendars[id];
  const ops: Op[] = [{ store: "calendars", delete: id }, ...dropContents(id)];
  await write([...ops, ...tidyStamps(), ...tidyPrefs()]);
};

/** What is in a calendar – its placements and notes – off this device. */
const dropContents = (calendar: string): Op[] => {
  const { placements, notes } = boop;
  const ops: Op[] = [];
  for (const p of Object.values(placements)) {
    if (p.calendar === calendar) {
      delete placements[p.id];
      ops.push({ store: "placements", delete: p.id });
    }
  }
  for (const note of Object.values(notes)) {
    if (note.calendar === calendar) {
      delete notes[note.id];
      ops.push({ store: "notes", delete: note.id });
    }
  }
  return ops;
};

/**
 * Brings the stamps in line with the calendars on this device: none stays
 * shared with a calendar that is gone – and someone else's stamp that is no
 * longer shared with the account (`shared`: all that are, as the server just
 * said) is off the tray. My own always stay. Someone else's goes for good
 * once nothing here needs it – shared with no calendar of mine, and no
 * print of it left: their doodle has no business on this device any more.
 * Should it be needed again, the next sync brings it back.
 */
const tidyStamps = (shared?: Set<string>): Op[] => {
  const { calendars, placements, stamps } = boop;
  const printed = new Set(Object.values(placements).map((p) => p.stamp));
  const ops: Op[] = [];
  for (const stamp of Object.values(stamps)) {
    const own = stamp.owner === boop.me?.id;
    const still =
      !own && shared && !shared.has(stamp.id)
        ? []
        : stamp.sharedWith.filter((id) => calendars[id]);
    if (!(own || still.length || printed.has(stamp.id))) {
      delete stamps[stamp.id];
      ops.push({ store: "stamps", delete: stamp.id });
    } else if (still.length !== stamp.sharedWith.length) {
      stamp.sharedWith = still;
      ops.push({ store: "stamps", put: plain(stamp) });
    }
  }
  return ops;
};

// ── Own settings ────────────────────────────────────────────────────────────

/**
 * What the account set for a calendar for itself alone (`CalendarPrefs`) is
 * kept on this device only: in the store's `prefs` and in IndexedDB (`meta`,
 * under `PREFS`) – loaded with the rest (`start`), gone with the device's
 * copy (logout, another account logging in) and with a calendar that leaves
 * the device (`tidyPrefs`). No server, no sync, no outbox: another device of
 * the same account knows nothing of them.
 *
 * They are to move to the account – with the notifications, which the server
 * has to know of. So nothing but the functions here touches `boop.prefs` or
 * its `meta` entry: `prefOf` and `colorOf` read, `setCalendarPref` writes.
 * Swap what is behind those three, and the app follows.
 */
const PREFS = "prefs";

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

/**
 * Sets some of the account's own settings for a calendar – `null` takes one
 * back. At once, like every change here; nothing to send.
 */
export const setCalendarPref = async (
  id: string,
  patch: { [K in keyof CalendarPrefs]?: CalendarPrefs[K] | null }
) => {
  if (!boop.calendars[id]) return;
  const next = Object.fromEntries(
    Object.entries({ ...boop.prefs[id], ...patch }).filter(
      ([, value]) => value != null
    )
  ) as CalendarPrefs;
  if (Object.keys(next).length) boop.prefs[id] = next;
  else delete boop.prefs[id];
  await write([{ store: "meta", put: plain(boop.prefs), key: PREFS }]);
};

/** No settings stay for a calendar that is off this device. */
const tidyPrefs = (): Op[] => {
  const gone = Object.keys(boop.prefs).filter((id) => !boop.calendars[id]);
  if (!gone.length) return [];
  for (const id of gone) delete boop.prefs[id];
  return [{ store: "meta", put: plain(boop.prefs), key: PREFS }];
};

// ── Invitations ─────────────────────────────────────────────────────────────

/**
 * Invitations to the account come with every sync, all of them (sync/
 * protocol.ts), and are kept on the device like the rest – in the store's
 * `invitations` and in IndexedDB (`meta`, under `INVITATIONS`): offline they
 * still show. Saying yes or no needs a connection – the server decides
 * (calendar/endpoints/invitations.ts) – and a sync follows.
 */
const INVITATIONS = "invitations";

/**
 * Answered here – kept out of what a sync asked for before the answer may
 * still bring, until one comes without them.
 */
const answered = new Set<string>();

/** The server's invitations, less those answered here meanwhile. */
const openInvitations = (incoming: InvitationDoc[]) => {
  for (const id of answered) {
    if (!incoming.some((invitation) => invitation.id === id)) {
      answered.delete(id);
    }
  }
  return incoming.filter((invitation) => !answered.has(invitation.id));
};

/** An invitation off the device – answered, or gone on the server. */
const dropInvitation = async (id: string) => {
  answered.add(id);
  boop.invitations = boop.invitations.filter(
    (invitation) => invitation.id !== id
  );
  await write([
    { store: "meta", put: plain(boop.invitations), key: INVITATIONS },
  ]);
};

/** The server's answer – none without a connection. */
const answer = (id: string, what: "accept" | "decline") =>
  fetch(`/api/invitations/${encodeURIComponent(id)}/${what}`, {
    method: "POST",
    credentials: "include",
  }).catch(() => null);

/** Not found, or over: the invitation is no more – taken back, perhaps. */
const isGone = (response: Response) =>
  response.status === 404 || response.status === 410;

/**
 * Says yes to an invitation – a member of its calendar from now on. The
 * calendar comes with the sync: once it is on the device, its id comes
 * back. “gone”: the invitation is no more (taken back, over, the calendar
 * deleted) – the sync takes it off the device, while whoever asked says so.
 */
export const acceptInvitation = async (
  id: string
): Promise<
  { ok: true; calendar: string } | { ok: false; reason: "gone" | "failed" }
> => {
  const response = await answer(id, "accept");
  if (response && isGone(response)) {
    void sync();
    return { ok: false, reason: "gone" };
  }
  const body = (await response?.json().catch(() => null)) as {
    calendar?: unknown;
  } | null;
  if (!(response?.ok && typeof body?.calendar === "string")) {
    return { ok: false, reason: "failed" };
  }
  const { calendar } = body;
  await dropInvitation(id);
  // A sync under way may have been asked for before the calendar was the
  // account's – then the next one brings it.
  for (let round = 0; round < 3 && !boop.calendars[calendar]; round++) {
    await sync();
  }
  return { ok: true, calendar };
};

/**
 * Says no to an invitation: it goes, and nothing else happens. One that is
 * no more is as good as turned down. False when the server couldn't be
 * asked.
 */
export const declineInvitation = async (id: string) => {
  const response = await answer(id, "decline");
  if (!(response && (response.ok || isGone(response)))) return false;
  await dropInvitation(id);
  void sync();
  return true;
};

// ── Sync ────────────────────────────────────────────────────────────────────

let timer: ReturnType<typeof setTimeout> | undefined;

/** Soon after a change – several quick changes go together. */
const scheduleSync = (delay = 700) => {
  clearTimeout(timer);
  timer = setTimeout(() => void sync(), delay);
};

let running: Promise<void> | null = null;
let again = false;

/** Sends the outbox and takes over what changed – unless offline. */
export const sync = async (): Promise<void> => {
  if (running) {
    again = true;
    return running;
  }
  if (!(boop.me && navigator.onLine)) return;
  running = (async () => {
    set({ syncing: true });
    try {
      // A few rounds at most: the outbox in parts, then missing stamps –
      // and a calendar the server names but this device doesn't have.
      for (let round = 0; round < 5; round++) {
        const batch = outbox.slice(0, MAX_CHANGES);
        for (const entry of batch) inFlight.add(entry.seq);
        const need = missingStamps();
        const body: SyncRequest = {
          since,
          // Only those really here: the server sends the others complete,
          // as it does new ones – so one this device lost comes back.
          known: known.filter(here),
          need,
          changes: batch.map((entry) => entry.change),
        };
        const response = await fetch("/api/sync", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (response.status === 401) {
          // The login expired – the data stays until someone logs in.
          set({ status: "signedOut" });
          return;
        }
        if (!response.ok) throw new Error(`Sync failed: ${response.status}`);
        const result = (await response.json()) as SyncResponse;
        const sent = new Set(batch.map((entry) => entry.seq));
        outbox = outbox.filter((entry) => !sent.has(entry.seq));
        inFlight.clear();
        await write(
          batch.map((entry) => ({ store: "outbox", delete: entry.seq }))
        );
        await merge(result);
        const stillMissing = missingStamps();
        const progress = need.some((id) => !stillMissing.includes(id));
        const lost = result.calendarIds.some((id) => !here(id));
        if (lost) continue;
        if (!outbox.length && (!stillMissing.length || !progress)) break;
      }
    } catch {
      // Offline or the server is away – the outbox waits for the next try.
    } finally {
      inFlight.clear();
      set({ syncing: false });
    }
  })();
  await running;
  running = null;
  if (again) {
    again = false;
    void sync();
  }
};

/** Stamps the device's placements use but it doesn't have. */
const missingStamps = () => [
  ...new Set(
    Object.values(boop.placements)
      .map((p) => p.stamp)
      .filter((id) => !boop.stamps[id])
  ),
];

/** True when a change for this document is still waiting to be sent. */
const waiting = (type: SyncType, id: string) =>
  outbox.some((entry) => entry.change.type === type && entry.change.id === id);

/**
 * Is this calendar on the device? Also one changed here and not yet sent –
 * deleted here, it is on its way out, not lost.
 */
const here = (id: string) =>
  Boolean(boop.calendars[id]) || waiting("calendar", id);

/** Takes over what the server sent – unless this device changed it since. */
const merge = async (result: SyncResponse) => {
  // Another account answered than the one on this device (logged in
  // elsewhere in this browser): start over with its data.
  if (boop.me && result.me.id !== boop.me.id) {
    await clearAll();
    window.location.reload();
    return;
  }
  const ops: Op[] = [];
  const { calendars, stamps, placements, notes } = boop;

  const take = <T extends { id: string; deleted: boolean }>(
    type: SyncType,
    docs: Docs<T>,
    incoming: T[]
  ) => {
    for (const doc of incoming) {
      if (waiting(type, doc.id)) continue;
      if (doc.deleted) {
        delete docs[doc.id];
        ops.push({ store: KIND[type], delete: doc.id });
      } else {
        docs[doc.id] = doc;
        ops.push({ store: KIND[type], put: plain(doc) });
      }
    }
  };
  take("calendar", calendars, result.calendars);
  take("stamp", stamps, result.stamps.map(stampDoc));
  take("placement", placements, result.placements);
  // A note is checked again before it is kept – nothing left of it, and it
  // is gone. (A server from before sends none.)
  const incoming = (result.notes ?? []).map((note) => {
    const content = note.deleted ? null : cleanNote(note.content);
    return { ...note, content, deleted: !content };
  });
  take("note", notes, incoming);

  // Refused and not sent back: it never made it to the server – it goes.
  const returned = new Set(
    [
      ...result.calendars,
      ...result.stamps,
      ...result.placements,
      ...incoming,
    ].map((doc) => doc.id)
  );
  for (const { type, id } of result.rejected) {
    if (returned.has(id) || waiting(type, id)) continue;
    const docs = {
      calendar: calendars,
      stamp: stamps,
      placement: placements,
      note: notes,
    }[type] as Docs<unknown>;
    delete docs[id];
    ops.push({ store: KIND[type], delete: id });
  }

  // Calendars the account no longer has – with all that is in them.
  const live = new Set(result.calendarIds);
  for (const id of Object.keys(calendars)) {
    if (live.has(id) || waiting("calendar", id)) continue;
    delete calendars[id];
    ops.push({ store: "calendars", delete: id }, ...dropContents(id));
  }
  // The stamps follow the calendars – and what others no longer share goes.
  ops.push(...tidyStamps(result.shared && new Set(result.shared)));
  // So do the account's own settings for them.
  ops.push(...tidyPrefs());

  const people = Object.fromEntries(
    result.people.map((person) => [person.id, person.name])
  );
  const invitations = result.invitations && openInvitations(result.invitations);
  since = result.now;
  known = result.calendarIds;
  ops.push(
    { store: "meta", put: result.now, key: "since" },
    { store: "meta", put: result.calendarIds, key: "known" },
    { store: "meta", put: people, key: "people" },
    { store: "meta", put: result.me, key: "me" }
  );
  if (invitations) {
    ops.push({ store: "meta", put: invitations, key: INVITATIONS });
  }
  await write(ops);
  set({ people, me: result.me, ...(invitations && { invitations }) });
};

// ── Logout ──────────────────────────────────────────────────────────────────

/** Logs out and clears this device's copy. Needs a connection. */
export const logout = async () => {
  const ok = await logoutRequest();
  if (!ok) return false;
  source?.close();
  source = null;
  await clearAll();
  outbox = [];
  since = null;
  known = [];
  answered.clear();
  set({
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
