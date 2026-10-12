"use client";

import { proxy, useSnapshot } from "valtio";
import {
  fetchMe,
  logout as logoutRequest,
  type Me,
} from "@/features/accounts/client";
import {
  type CalendarDoc,
  type ColorName,
  type DayKey,
  type Drawing,
  type KeptStampDoc,
  type PlacementDoc,
  type StampDoc,
  type StampShape,
  stampDoc,
} from "@/features/calendar/model";
import type {
  Change,
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
  /** Names of the people in the account's calendars, by id. */
  people: Record<string, string>;
};

const KIND = {
  calendar: "calendars",
  stamp: "stamps",
  placement: "placements",
} as const satisfies Record<SyncType, string>;

export const boop = proxy<BoopState>({
  status: "loading",
  me: null,
  online: true,
  syncing: false,
  pending: 0,
  calendars: {},
  stamps: {},
  placements: {},
  people: {},
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
  const [
    calendars,
    stamps,
    placements,
    entries,
    me,
    people,
    savedSince,
    savedKnown,
  ] = await Promise.all([
    getAll<CalendarDoc>("calendars"),
    getAll<KeptStampDoc>("stamps"),
    getAll<PlacementDoc>("placements"),
    getAll<OutboxEntry>("outbox"),
    getMeta<Me>("me"),
    getMeta<Record<string, string>>("people"),
    getMeta<string>("since"),
    getMeta<string[]>("known"),
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
    people: people ?? {},
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
    set({ calendars: {}, stamps: {}, placements: {}, people: {} });
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
 * takes the new fields in – the server gets one change, not ten.
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
      deleted: change.deleted || waiting.change.deleted,
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
  if (!doc || doc.personal) return;
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
 * A calendar off this device – with its placements. The stamps follow
 * (`tidyStamps`): mine all stay.
 */
const dropCalendar = async (id: string) => {
  const { calendars, placements } = boop;
  delete calendars[id];
  const ops: Op[] = [{ store: "calendars", delete: id }];
  for (const p of Object.values(placements)) {
    if (p.calendar === id) {
      delete placements[p.id];
      ops.push({ store: "placements", delete: p.id });
    }
  }
  await write([...ops, ...tidyStamps()]);
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
      // A few rounds at most: the outbox in parts, then missing stamps.
      for (let round = 0; round < 5; round++) {
        const batch = outbox.slice(0, MAX_CHANGES);
        for (const entry of batch) inFlight.add(entry.seq);
        const need = missingStamps();
        const body: SyncRequest = {
          since,
          known,
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
  const { calendars, stamps, placements } = boop;

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

  // Refused and not sent back: it never made it to the server – it goes.
  const returned = new Set(
    [...result.calendars, ...result.stamps, ...result.placements].map(
      (doc) => doc.id
    )
  );
  for (const { type, id } of result.rejected) {
    if (returned.has(id) || waiting(type, id)) continue;
    const docs = { calendar: calendars, stamp: stamps, placement: placements }[
      type
    ] as Docs<unknown>;
    delete docs[id];
    ops.push({ store: KIND[type], delete: id });
  }

  // Calendars the account no longer has – with all that is in them.
  const live = new Set(result.calendarIds);
  for (const id of Object.keys(calendars)) {
    if (live.has(id) || waiting("calendar", id)) continue;
    delete calendars[id];
    ops.push({ store: "calendars", delete: id });
    for (const p of Object.values(placements)) {
      if (p.calendar === id) {
        delete placements[p.id];
        ops.push({ store: "placements", delete: p.id });
      }
    }
  }
  // The stamps follow the calendars – and what others no longer share goes.
  ops.push(...tidyStamps(result.shared && new Set(result.shared)));

  const people = Object.fromEntries(
    result.people.map((person) => [person.id, person.name])
  );
  since = result.now;
  known = result.calendarIds;
  ops.push(
    { store: "meta", put: result.now, key: "since" },
    { store: "meta", put: result.calendarIds, key: "known" },
    { store: "meta", put: people, key: "people" },
    { store: "meta", put: result.me, key: "me" }
  );
  await write(ops);
  set({ people, me: result.me });
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
  set({
    status: "signedOut",
    me: null,
    calendars: {},
    stamps: {},
    placements: {},
    people: {},
  });
  return true;
};
