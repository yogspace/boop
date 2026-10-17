import type { Change, SyncType } from "@/features/sync/protocol";
import { write } from "../db";
import {
  type Docs,
  KIND,
  type Kind,
  type Local,
  type OutboxEntry,
} from "./local";
import { scheduleSync } from "./sync";

/**
 * How a change is made here: at once in the store and the device's copy
 * (`keep`), and noted in the outbox (`enqueue`), which the sync takes to the
 * server soon after (store/sync.ts). The actions per kind beside this file
 * all go this way.
 */

/**
 * Notes a change in the outbox. One still waiting for the same document
 * takes the new fields in – the server gets one change, not ten. Deleted
 * stays deleted – but a day's note, emptied and written again, is the same
 * note (its id is the day's): its last word counts.
 */
export const enqueue = async (local: Local, change: Change) => {
  const waiting = local.outbox.find(
    (entry) =>
      !local.inFlight.has(entry.seq) &&
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
    local.nextSeq = Math.max(
      local.nextSeq,
      Date.now(),
      (local.outbox.at(-1)?.seq ?? 0) + 1
    );
    entry = { seq: local.nextSeq++, change };
    local.outbox.push(entry);
  }
  await write([{ store: "outbox", put: plain(entry) }]);
  scheduleSync(local);
};

/** True when a change for this document is still waiting to be sent. */
export const waiting = (local: Local, type: SyncType, id: string) =>
  local.outbox.some(
    (entry) => entry.change.type === type && entry.change.id === id
  );

/**
 * A plain copy for IndexedDB. Objects put into the store become valtio
 * proxies (also nested ones, like a stamp's drawing) – and IndexedDB can't
 * store a proxy. The data is plain JSON, so a JSON copy is exact.
 */
export const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Puts a document into the device's copy and the store. */
export const keep = async <T extends { id: string; deleted: boolean }>(
  local: Local,
  type: Kind,
  doc: T
) => {
  const kind = KIND[type];
  const record = plain(doc);
  const docs = local.boop[kind] as unknown as Docs<T>;
  if (doc.deleted) delete docs[doc.id];
  else docs[doc.id] = doc;
  await write([
    doc.deleted
      ? { store: kind, delete: doc.id }
      : { store: kind, put: record },
  ]);
};

export const now = () => new Date().toISOString();

/** The account's id – an action without one is a mistake. */
export const me = (local: Local) => {
  if (!local.boop.me) throw new Error("Not logged in");
  return local.boop.me.id;
};
