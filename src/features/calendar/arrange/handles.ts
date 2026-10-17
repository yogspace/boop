import type { Point } from "../art";
import { type Frame, intoFrame } from "./transform";

/**
 * The selection frame's handles: where they are, what a point grabs, and
 * the cursor that shows it.
 */

/** The cursor for a handle – pointing the way it sizes, the frame turned. */
export const sizeCursor = (f: Frame, [hx, hy]: Point) => {
  const turned = (Math.atan2(hy, hx) + f.angle) * (180 / Math.PI);
  const way = (((turned % 180) + 180) % 180) / 45;
  return ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][
    Math.round(way) % 4
  ];
};

/** The frame's handles: its corners and the middles of its sides. */
export const HANDLES: Point[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

export type Grip =
  | { kind: "size"; handle: Point }
  | { kind: "turn" }
  | { kind: "move" };

/**
 * What a point on the selection grabs (lengths on the face): a handle
 * within `reach` – a corner, or a side anywhere along it; just outside a
 * corner (up to `turn` from it) the turn; the knob above the frame (`knob`
 * up, touch); the frame's inside moves. On a frame too small for its
 * handles, inside it moves – the handles are reached from outside.
 */
export const grip = (
  f: Frame,
  x: number,
  y: number,
  { reach, turn = 0, knob = 0 }: { reach: number; turn?: number; knob?: number }
): Grip | null => {
  const [u, v] = intoFrame(f, x, y);
  const hw = f.w / 2;
  const hh = f.h / 2;
  const inside = Math.abs(u) <= hw && Math.abs(v) <= hh;
  if (knob && Math.hypot(u, v + hh + knob) <= reach) return { kind: "turn" };
  const small = Math.min(f.w, f.h) < reach * 3;
  if (!(inside && small)) {
    for (const [hx, hy] of HANDLES) {
      if (!(hx && hy)) continue;
      if (Math.hypot(u - hx * hw, v - hy * hh) <= reach) {
        return { kind: "size", handle: [hx, hy] };
      }
    }
    // A side: within reach outside it, less far in on a narrow frame.
    const inX = Math.min(reach, f.w / 4);
    const inY = Math.min(reach, f.h / 4);
    if (Math.abs(u) <= hw) {
      if (v >= -hh - reach && v <= -hh + inY)
        return { kind: "size", handle: [0, -1] };
      if (v <= hh + reach && v >= hh - inY)
        return { kind: "size", handle: [0, 1] };
    }
    if (Math.abs(v) <= hh) {
      if (u >= -hw - reach && u <= -hw + inX)
        return { kind: "size", handle: [-1, 0] };
      if (u <= hw + reach && u >= hw - inX)
        return { kind: "size", handle: [1, 0] };
    }
  }
  if (inside) return { kind: "move" };
  if (turn) {
    for (const [hx, hy] of HANDLES) {
      if (hx && hy && Math.hypot(u - hx * hw, v - hy * hh) <= turn) {
        return { kind: "turn" };
      }
    }
  }
  return null;
};
