import type { Snapshot } from "valtio";
import type { Art } from "@/features/calendar/art";
import type { Drawing } from "@/features/calendar/model";

/**
 * The drawing as the editor holds it, and its steps: every one can be taken
 * back and done again.
 */

/** How many steps undo reaches back. */
export const STEPS_BACK = 100;

/** What is drawn: the lines – and an uploaded picture's filled areas. */
export const BLANK: Art = { strokes: [], fills: [] };

/**
 * A stamp's drawing as the editor holds it – a copy of its own to change:
 * the lines with their anchors (to edit their points again), the filled
 * areas.
 */
export const artOf = (drawing: Snapshot<Drawing> | null | undefined): Art => {
  const copy = drawing && (JSON.parse(JSON.stringify(drawing)) as Drawing);
  return copy ? { strokes: copy.strokes, fills: copy.fills ?? [] } : BLANK;
};

/**
 * Every step of the drawing (a line, a point of one, a picture, clearing,
 * an erasing, a move, a removal, a template) can be taken back and done
 * again: the ones before `now` and the ones taken back after it.
 */
export type History = { past: Art[]; now: Art; future: Art[] };

/** A new step – what was taken back is gone then. */
export const step = (history: History, next: (now: Art) => Art): History => ({
  past: [...history.past, history.now].slice(-STEPS_BACK),
  now: next(history.now),
  future: [],
});

/**
 * A gesture's change shown as it goes, without a step (`now` only) – then,
 * done, made one step from where it began (`before`).
 */
export const meanwhile =
  (next: Art) =>
  (history: History): History => ({ ...history, now: next });

export const settled =
  (before: Art) =>
  (history: History): History => ({
    past: [...history.past, before].slice(-STEPS_BACK),
    now: history.now,
    future: [],
  });

export const back = ({ past, now, future }: History): History => {
  const before = past.at(-1);
  return before
    ? { past: past.slice(0, -1), now: before, future: [now, ...future] }
    : { past, now, future };
};

export const forward = ({ past, now, future }: History): History => {
  const [next, ...rest] = future;
  return next
    ? { past: [...past, now], now: next, future: rest }
    : { past, now, future };
};
