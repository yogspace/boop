import { boxOfPoints, emptyBox, grow, type Point } from "../art";
import {
  apply,
  compose,
  type Frame,
  intoFrame,
  type Matrix,
  sizeIn,
  translate,
  turnAbout,
} from "./transform";

/**
 * Moving, turning and sizing as the pointer or two fingers go – kept on
 * the face: every point stays in the unit square, a change stops at its
 * edge.
 */

/** A hair over the edge still counts as on it. */
const EPS = 1e-6;

/** Whether the points, changed, stay in the unit square. */
export const fits = (points: readonly number[], m: Matrix) => {
  for (let i = 0; i + 1 < points.length; i += 2) {
    const [x, y] = apply(m, points[i], points[i + 1]);
    if (x < -EPS || y < -EPS || x > 1 + EPS || y > 1 + EPS) return false;
  }
  return true;
};

/**
 * How much of a change (0–1) can be made with the points staying in the
 * square – `make(t)` the change made that far.
 */
export const furthest = (
  points: readonly number[],
  make: (t: number) => Matrix
) => {
  if (fits(points, make(1))) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (fits(points, make(mid))) lo = mid;
    else hi = mid;
  }
  return lo;
};

/** A move kept on the face: the points stop at the square's edge. */
export const moveWithin = (
  points: readonly number[],
  dx: number,
  dy: number
): Point => {
  if (!points.length) return [dx, dy];
  const box = boxOfPoints(points);
  return [
    Math.min(Math.max(dx, Math.min(0, -box.x0)), Math.max(0, 1 - box.x1)),
    Math.min(Math.max(dy, Math.min(0, -box.y0)), Math.max(0, 1 - box.y1)),
  ];
};

/** Turning snaps to these steps with ⇧ – 15°, like Figma. */
export const TURN_STEP = Math.PI / 12;
/** A frame is never sized smaller than this (a share of the face). */
const LEAST = 0.02;

/**
 * Turning the frame about its middle, from where it was grabbed to where
 * the pointer is – in 15° steps with `snap`. Turned past the edge, it is
 * pushed back onto the face if it fits there; else it stops.
 */
export const turning = (
  f: Frame,
  points: readonly number[],
  from: Point,
  to: Point,
  snap: boolean
): Matrix => {
  let delta =
    Math.atan2(to[1] - f.cy, to[0] - f.cx) -
    Math.atan2(from[1] - f.cy, from[0] - f.cx);
  if (snap)
    delta = Math.round((f.angle + delta) / TURN_STEP) * TURN_STEP - f.angle;
  const m = turnAbout(delta, f.cx, f.cy);
  if (fits(points, m)) return m;
  const box = emptyBox();
  for (let i = 0; i + 1 < points.length; i += 2) {
    const [x, y] = apply(m, points[i], points[i + 1]);
    grow(box, x, y);
  }
  if (box.x1 - box.x0 <= 1 && box.y1 - box.y0 <= 1) {
    const dx = box.x0 < 0 ? -box.x0 : Math.min(0, 1 - box.x1);
    const dy = box.y0 < 0 ? -box.y0 : Math.min(0, 1 - box.y1);
    return compose(translate(dx, dy), m);
  }
  const t = furthest(points, (t) => turnAbout(delta * t, f.cx, f.cy));
  return turnAbout(delta * t, f.cx, f.cy);
};

/**
 * Sizing by a handle – [hx, hy], −1/0/1 along the frame's sides: a corner
 * or the middle of a side – dragged from `from` to `to`. The opposite
 * corner or side stays (the middle, `centered` – Alt); a corner sizes
 * freely (in proportion with `even` – ⇧), a side along its axis (both with
 * `even`). Never flipped, never below a least size, never off the face.
 */
export const sizing = (
  f: Frame,
  points: readonly number[],
  [hx, hy]: Point,
  from: Point,
  to: Point,
  { even = false, centered = false } = {}
): Matrix => {
  const [fu, fv] = intoFrame(f, from[0], from[1]);
  const [tu, tv] = intoFrame(f, to[0], to[1]);
  // Where the handle is dragged to, and what stays.
  const hu = (hx * f.w) / 2 + tu - fu;
  const hv = (hy * f.h) / 2 + tv - fv;
  const ax = centered ? 0 : (-hx * f.w) / 2;
  const ay = centered ? 0 : (-hy * f.h) / 2;
  const reachX = (hx * f.w) / 2 - ax;
  const reachY = (hy * f.h) / 2 - ay;
  let sx = hx && reachX ? (hu - ax) / reachX : 1;
  let sy = hy && reachY ? (hv - ay) / reachY : 1;
  const leastX = Math.min(1, LEAST / Math.max(f.w, 1e-9));
  const leastY = Math.min(1, LEAST / Math.max(f.h, 1e-9));
  if (even) {
    let s = hx ? sx : sy;
    if (hx && hy) {
      // Along the diagonal – how far the pointer got along it.
      s =
        ((hu - ax) * reachX + (hv - ay) * reachY) / (reachX ** 2 + reachY ** 2);
    }
    s = Math.max(s, leastX, leastY);
    sx = s;
    sy = s;
  } else {
    sx = Math.max(sx, leastX);
    sy = Math.max(sy, leastY);
  }
  const make = (tx: number, ty: number) =>
    sizeIn(f, 1 + tx * (sx - 1), 1 + ty * (sy - 1), ax, ay);
  if (fits(points, make(1, 1))) return make(1, 1);
  if (even) {
    const t = furthest(points, (t) => make(t, t));
    return make(t, t);
  }
  // Each axis as far as it goes – one stopped at the edge, the other on.
  const tx = furthest(points, (t) => make(t, 0));
  const ty = furthest(points, (t) => make(tx, t));
  return make(tx, ty);
};

/**
 * Two fingers: turned and sized (evenly) about where they began, moved
 * along with their middle – as far as the face allows.
 */
export const pinching = (
  f: Frame,
  points: readonly number[],
  from: [Point, Point],
  to: [Point, Point]
): Matrix => {
  const [a0, b0] = from;
  const [a1, b1] = to;
  const mid0: Point = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];
  const mid1: Point = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
  const least = Math.min(1, LEAST / Math.max(Math.min(f.w, f.h), 1e-9));
  const scale = Math.max(
    least,
    Math.hypot(b1[0] - a1[0], b1[1] - a1[1]) /
      Math.max(Math.hypot(b0[0] - a0[0], b0[1] - a0[1]), 1e-6)
  );
  const delta =
    Math.atan2(b1[1] - a1[1], b1[0] - a1[0]) -
    Math.atan2(b0[1] - a0[1], b0[0] - a0[0]);
  const make = (t: number): Matrix => {
    const s = 1 + t * (scale - 1);
    const c = Math.cos(delta * t) * s;
    const n = Math.sin(delta * t) * s;
    return compose(
      translate(
        mid0[0] + t * (mid1[0] - mid0[0]),
        mid0[1] + t * (mid1[1] - mid0[1])
      ),
      compose([c, n, -n, c, 0, 0], translate(-mid0[0], -mid0[1]))
    );
  };
  return make(furthest(points, make));
};
