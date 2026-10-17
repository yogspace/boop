import type {
  ColorName,
  Drawing,
  StampDoc,
  StampShape,
} from "@/features/calendar/model";
import { newId } from "@/lib/id";
import { type Op, write } from "../db";
import { enqueue, keep, me, now, plain } from "./changes";
import type { Local } from "./local";

/**
 * The stamps: drawn, shared, renamed, drawn anew, deleted – each its
 * owner's call. And which of them stay on this device (`tidyStamps`).
 */

export const createStamp = async (
  local: Local,
  stamp: {
    name: string;
    color: ColorName;
    shape: StampShape;
    drawing: Drawing;
    /** Calendars whose members may stamp with it too – none: just me. */
    sharedWith: string[];
  }
) => {
  const doc: StampDoc = {
    id: newId(),
    ...stamp,
    owner: me(local),
    changedAt: now(),
    deleted: false,
  };
  await keep(local, "stamp", doc);
  await enqueue(local, {
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
export const shareStamp = async (
  local: Local,
  id: string,
  sharedWith: string[]
) => {
  const doc = local.boop.stamps[id];
  if (!doc || doc.owner !== local.boop.me?.id) return;
  const changedAt = now();
  await keep(local, "stamp", { ...plain(doc), sharedWith, changedAt });
  await enqueue(local, { type: "stamp", id, changedAt, data: { sharedWith } });
};

/** A stamp's name – or none (""). Its owner's call, like the sharing. */
export const renameStamp = async (local: Local, id: string, name: string) => {
  const doc = local.boop.stamps[id];
  if (!doc || doc.owner !== local.boop.me?.id) return;
  const changedAt = now();
  await keep(local, "stamp", { ...plain(doc), name, changedAt });
  await enqueue(local, { type: "stamp", id, changedAt, data: { name } });
};

/** What the editor changes of a stamp – only what it says goes. */
export type StampChange = Partial<
  Pick<StampDoc, "name" | "color" | "shape" | "drawing" | "sharedWith">
>;

/**
 * A stamp drawn anew in the editor: its look – color, shape, drawing (its
 * rim and flags with it) – and its name and sharing, whatever of them
 * changed. Its owner's call, and only for one they drew: a copy (a card
 * taken, a gift) looks like its original – the server refuses it, and
 * brings the original's changes instead (cards/follow.ts). Its prints show
 * the new look at once: they only point to the stamp.
 */
export const updateStamp = async (
  local: Local,
  id: string,
  change: StampChange
) => {
  const doc = local.boop.stamps[id];
  if (!doc || doc.owner !== local.boop.me?.id || doc.origin) return;
  const data = plain(change);
  if (!Object.keys(data).length) return;
  const changedAt = now();
  await keep(local, "stamp", { ...plain(doc), ...data, changedAt });
  await enqueue(local, { type: "stamp", id, changedAt, data });
};

/**
 * A gift unwrapped on the shelf – for good, on every device: the paper
 * only ever comes off (sync/apply.ts). Its owner's, like the rest.
 */
export const unwrapStamp = async (local: Local, id: string) => {
  const doc = local.boop.stamps[id];
  if (!doc?.wrapped || doc.owner !== local.boop.me?.id) return;
  const changedAt = now();
  const { wrapped: _, ...unwrapped } = plain(doc);
  await keep(local, "stamp", { ...unwrapped, changedAt });
  await enqueue(local, {
    type: "stamp",
    id,
    changedAt,
    data: { wrapped: false },
  });
};

export const deleteStamp = async (local: Local, id: string) => {
  const { boop } = local;
  const doc = boop.stamps[id];
  if (!doc) return;
  const changedAt = now();
  await keep(local, "stamp", { ...plain(doc), deleted: true, changedAt });
  // Its prints go along – the server removes them for everyone else.
  const ops: Op[] = [];
  for (const p of Object.values(boop.placements)) {
    if (p.stamp === id) {
      delete boop.placements[p.id];
      ops.push({ store: "placements", delete: p.id });
    }
  }
  await write(ops);
  await enqueue(local, { type: "stamp", id, changedAt, deleted: true });
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
export const tidyStamps = (local: Local, shared?: Set<string>): Op[] => {
  const { calendars, placements, stamps } = local.boop;
  const printed = new Set(Object.values(placements).map((p) => p.stamp));
  const ops: Op[] = [];
  for (const stamp of Object.values(stamps)) {
    const own = stamp.owner === local.boop.me?.id;
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
