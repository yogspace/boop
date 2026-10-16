import type { Point } from "./path";

/**
 * Calm freehand lines – what the pen (stamp-drawer.tsx) makes of a shaky
 * hand, a finger on glass above all:
 *
 * 1. **Steady** – the line follows the pointer like a brush pulled on a
 *    short string (a “lazy brush”): it moves only once the pointer is
 *    `reach` away, and then just enough to stay that close – the hand's
 *    tremor stays in the string. What it leaves behind is eased a little
 *    more (`ease`: each point that share of the way to where the brush
 *    is). Let go, it runs on to where the pointer was.
 * 2. **Kept** – done, the line keeps only the points it needs to stay
 *    within `tolerance` of itself (Ramer–Douglas–Peucker) – and beside each
 *    corner one more, close by: a drawing is drawn as quadratic curves
 *    through the middles of its points (stamp-svg.tsx `strokePath`), which
 *    would round a corner between two long stretches off by a quarter of
 *    their length.
 *
 * Unit lengths, like every drawing; the editor turns its px into them, so
 * a line drawn zoomed in is as calm as one drawn on the whole face.
 */

/** A pen's brush on its string. */
export type Steady = {
  /** The pointer is here – the points the line gets (none within reach). */
  to: (x: number, y: number) => Point[];
  /** Let go here – the rest of the way. */
  end: (x: number, y: number) => Point[];
  /** Where the line is now – its tip. */
  tip: () => Point;
};

export const steady = (
  x: number,
  y: number,
  {
    reach,
    ease = 0.55,
    step = reach / 4,
  }: {
    /** How long the string is. */
    reach: number;
    /** How far each point goes towards the brush (1: all the way). */
    ease?: number;
    /** Points nearer than this to the last are left out. */
    step?: number;
  }
): Steady => {
  let bx = x;
  let by = y;
  let lx = x;
  let ly = y;
  let last: Point = [x, y];
  const put = (out: Point[]) => {
    lx += (bx - lx) * ease;
    ly += (by - ly) * ease;
    if (Math.hypot(lx - last[0], ly - last[1]) >= step) {
      last = [lx, ly];
      out.push(last);
    }
  };
  return {
    to: (px, py) => {
      const out: Point[] = [];
      const d = Math.hypot(px - bx, py - by);
      if (d <= reach) return out;
      // Pulled along – in a few steps where the pointer leapt far.
      const parts = Math.max(1, Math.ceil((d - reach) / (reach * 2)));
      const tx = bx + ((px - bx) * (d - reach)) / d;
      const ty = by + ((py - by) * (d - reach)) / d;
      const fx = bx;
      const fy = by;
      for (let i = 1; i <= parts; i++) {
        bx = fx + ((tx - fx) * i) / parts;
        by = fy + ((ty - fy) * i) / parts;
        put(out);
      }
      return out;
    },
    end: (px, py) => {
      const out: Point[] = [];
      // On to where it was let go: the eased tip catches up, straight there.
      bx = px;
      by = py;
      for (let i = 0; i < 3; i++) put(out);
      if (last[0] !== px || last[1] !== py) {
        last = [px, py];
        out.push(last);
      }
      return out;
    },
    tip: () => [lx, ly],
  };
};

/**
 * A line's points as kept: within `tolerance` of the line as drawn, a point
 * `near` each corner on both sides where the stretch is long – flat pairs,
 * rounded to 3 decimals and in the unit square, like every drawing's.
 */
export const keepLine = (
  points: readonly Point[],
  { tolerance, near }: { tolerance: number; near: number }
): number[] => {
  const round = (n: number) =>
    Math.round(Math.min(Math.max(n, 0), 1) * 1000) / 1000;
  if (points.length < 3)
    return points.flatMap(([x, y]) => [round(x), round(y)]);
  // Ramer–Douglas–Peucker: the ends, and whichever point lies furthest off
  // the line between – again on both sides of it – while one is further
  // than `tolerance`.
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    let worst = -1;
    let at = -1;
    for (let k = a + 1; k < b; k++) {
      const [px, py] = points[k];
      const off = length
        ? Math.abs((px - ax) * dy - (py - ay) * dx) / length
        : Math.hypot(px - ax, py - ay);
      if (off > worst) {
        worst = off;
        at = k;
      }
    }
    if (at >= 0 && worst > tolerance) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  const kept = Array.from(keep.keys()).filter((k) => keep[k]);
  const out: Point[] = [];
  kept.forEach((k, i) => {
    const p = points[k];
    const next = kept[i + 1];
    out.push(p);
    if (next === undefined) return;
    const q = points[next];
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (length > 3 * near) {
      // A point near each end of a long stretch – the corners stay corners.
      const t = near / length;
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      out.push([q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t]);
    }
  });
  const flat: number[] = [];
  for (const [x, y] of out) {
    const rx = round(x);
    const ry = round(y);
    if (
      flat.length &&
      flat[flat.length - 2] === rx &&
      flat[flat.length - 1] === ry
    ) {
      continue;
    }
    flat.push(rx, ry);
  }
  return flat;
};
