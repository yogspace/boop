import type {
  ColorName,
  DayKey,
  PlacementDoc,
} from "@/features/calendar/model";
import { newId } from "@/lib/id";
import { enqueue, keep, me, now } from "./changes";
import type { Local } from "./local";

/**
 * The prints on the days: placed, put back (undo), moved, removed – by any
 * member of their calendar.
 */

export const placeStamp = async (
  local: Local,
  {
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
  }
) => {
  const top =
    Math.max(
      0,
      ...Object.values(local.boop.placements)
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
    placedBy: me(local),
    changedAt: now(),
    deleted: false,
  };
  await keep(local, "placement", doc);
  await enqueue(local, {
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
  local: Local,
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
  placeStamp(local, {
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
  local: Local,
  id: string,
  patch: Partial<Pick<PlacementDoc, "x" | "y" | "rotation" | "scale" | "z">>
) => {
  const doc = local.boop.placements[id];
  if (!doc) return;
  const changedAt = now();
  await keep(local, "placement", { ...doc, ...patch, changedAt });
  await enqueue(local, { type: "placement", id, changedAt, data: patch });
};

export const removePlacement = async (local: Local, id: string) => {
  const doc = local.boop.placements[id];
  if (!doc) return;
  const changedAt = now();
  await keep(local, "placement", { ...doc, deleted: true, changedAt });
  await enqueue(local, { type: "placement", id, changedAt, deleted: true });
};
