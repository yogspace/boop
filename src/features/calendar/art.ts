import type { Fill, Stroke } from "./model";

/**
 * What is drawn on a stamp – its lines and filled areas, without the rest
 * of the drawing (rim, inverted, special) – as geometry: where a line
 * really runs, what lies inside an area, how far a point is from either.
 * Shared by the eraser (eraser.ts) and moving things about (arrange.ts).
 * Plain numbers in the unit square, y down; no browser needed.
 */

export type Art = { strokes: Stroke[]; fills: Fill[] };
export type Point = [number, number];
export type Box = { x0: number; y0: number; x1: number; y1: number };

/** Rounded to 3 decimals – like every point a drawing keeps. */
export const round = (n: number) => Math.round(n * 1000) / 1000;

/** Points along a line at most this far apart (`samplesOf`). */
export const SAMPLE = 0.003;

/** A box that holds nothing yet – grows with `grow`. */
export const emptyBox = (): Box => ({
  x0: Infinity,
  y0: Infinity,
  x1: -Infinity,
  y1: -Infinity,
});

export const grow = (box: Box, x: number, y: number, pad = 0) => {
  box.x0 = Math.min(box.x0, x - pad);
  box.y0 = Math.min(box.y0, y - pad);
  box.x1 = Math.max(box.x1, x + pad);
  box.y1 = Math.max(box.y1, y + pad);
};

export const overlaps = (a: Box, b: Box, pad = 0) =>
  a.x0 - pad <= b.x1 &&
  b.x0 <= a.x1 + pad &&
  a.y0 - pad <= b.y1 &&
  b.y0 <= a.y1 + pad;

/** The box of flat pairs, each point `pad` all round. */
export const boxOfPoints = (p: readonly number[], pad = 0): Box => {
  const box = emptyBox();
  for (let i = 0; i + 1 < p.length; i += 2) grow(box, p[i], p[i + 1], pad);
  return box;
};

/** How far – squared – a point lies from the segment a–b. */
export const distanceSq = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
) => {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t =
    length > 0
      ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length))
      : 0;
  const x = px - ax - t * dx;
  const y = py - ay - t * dy;
  return x * x + y * y;
};

/**
 * The points a line passes through as it is drawn (stamp-svg.tsx
 * `strokePath`, build.ts the same): quadratic curves through the midpoints
 * of its points, straight at both ends – a short one straight from its
 * first point to its last. At most `step` apart, flat pairs.
 */
export const sampleStroke = (p: readonly number[], step = SAMPLE) => {
  const n = Math.floor(p.length / 2);
  if (!n) return [];
  const out = [p[0], p[1]];
  const line = (ax: number, ay: number, bx: number, by: number) => {
    const parts = Math.ceil(Math.hypot(bx - ax, by - ay) / step);
    for (let k = 1; k <= parts; k++) {
      out.push(ax + ((bx - ax) * k) / parts, ay + ((by - ay) * k) / parts);
    }
  };
  if (n < 3) {
    line(p[0], p[1], p[2 * n - 2], p[2 * n - 1]);
    return out;
  }
  let ax = p[0];
  let ay = p[1];
  for (let k = 1; k < n - 1; k++) {
    const cx = p[2 * k];
    const cy = p[2 * k + 1];
    const bx = (cx + p[2 * k + 2]) / 2;
    const by = (cy + p[2 * k + 3]) / 2;
    const parts = Math.max(
      1,
      Math.ceil(
        (Math.hypot(cx - ax, cy - ay) + Math.hypot(bx - cx, by - cy)) / step
      )
    );
    for (let j = 1; j <= parts; j++) {
      const t = j / parts;
      const u = 1 - t;
      out.push(
        u * u * ax + 2 * u * t * cx + t * t * bx,
        u * u * ay + 2 * u * t * cy + t * t * by
      );
    }
    ax = bx;
    ay = by;
  }
  line(ax, ay, p[2 * n - 2], p[2 * n - 1]);
  return out;
};

/** Each line's points as drawn – worked out once per line (lines never change). */
const samples = new WeakMap<Stroke, number[]>();
export const samplesOf = (stroke: Stroke) => {
  let known = samples.get(stroke);
  if (!known) {
    known = sampleStroke(stroke.p);
    samples.set(stroke, known);
  }
  return known;
};

/** A line's box – as far as its round edge reaches. */
const strokeBoxes = new WeakMap<Stroke, Box>();
export const strokeBox = (stroke: Stroke) => {
  let box = strokeBoxes.get(stroke);
  if (!box) {
    box = boxOfPoints(stroke.p, stroke.w / 2);
    strokeBoxes.set(stroke, box);
  }
  return box;
};

const fillBoxes = new WeakMap<Fill, Box>();
export const fillBox = (fill: Fill) => {
  let box = fillBoxes.get(fill);
  if (!box) {
    box = emptyBox();
    for (const ring of fill.p) {
      for (let i = 0; i + 1 < ring.length; i += 2)
        grow(box, ring[i], ring[i + 1]);
    }
    fillBoxes.set(fill, box);
  }
  return box;
};

/** The outlines that count – less than three points enclose nothing. */
export const ringsOf = (fill: Fill) =>
  fill.p.filter((ring) => ring.length >= 6);

/**
 * Where a filled area's outlines cross the line at height `y`: each place
 * and which way the outline runs there (1 down, −1 up). Half-open, so a
 * corner exactly on the line counts once.
 */
export const crossings = (fill: Fill, y: number) => {
  const found: { x: number; dir: number }[] = [];
  for (const ring of ringsOf(fill)) {
    const n = Math.floor(ring.length / 2);
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = ring[2 * j];
      const ay = ring[2 * j + 1];
      const bx = ring[2 * i];
      const by = ring[2 * i + 1];
      if (ay > y === by > y) continue;
      found.push({
        x: ax + ((y - ay) * (bx - ax)) / (by - ay),
        dir: by > ay ? 1 : -1,
      });
    }
  }
  return found.sort((a, b) => a.x - b.x);
};

/**
 * The stretches of the line at height `y` that lie inside the area – by its
 * rule, as SVG fills it: non-zero winding or even-odd.
 */
export const spans = (fill: Fill, y: number): [number, number][] => {
  const out: [number, number][] = [];
  let winding = 0;
  let from = 0;
  for (const { x, dir } of crossings(fill, y)) {
    const was = winding;
    winding = fill.rule === "evenodd" ? winding ^ 1 : winding + dir;
    if (!was && winding) from = x;
    else if (was && !winding) out.push([from, x]);
  }
  return out;
};

export const insideFill = (fill: Fill, x: number, y: number) =>
  spans(fill, y).some(([a, b]) => a <= x && x <= b);

/** How far – squared – a point lies from an area's outlines. */
export const edgeDistanceSq = (fill: Fill, x: number, y: number) => {
  let best = Infinity;
  for (const ring of ringsOf(fill)) {
    const n = Math.floor(ring.length / 2);
    for (let i = 0, j = n - 1; i < n; j = i++) {
      best = Math.min(
        best,
        distanceSq(
          x,
          y,
          ring[2 * j],
          ring[2 * j + 1],
          ring[2 * i],
          ring[2 * i + 1]
        )
      );
    }
  }
  return best;
};

/** How far a point lies off the line through two others. */
const off = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
) => Math.sqrt(distanceSq(px, py, ax, ay, bx, by));

/**
 * The points that give a line its form (Douglas–Peucker) – flat pairs in,
 * flat pairs out; the ends always stay.
 */
export const thin = (p: readonly number[], tolerance: number): number[] => {
  const n = Math.floor(p.length / 2);
  if (n < 3) return p.slice(0, n * 2);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const todo: [number, number][] = [[0, n - 1]];
  for (let next = todo.pop(); next; next = todo.pop()) {
    const [from, to] = next;
    let far = 0;
    let index = -1;
    for (let i = from + 1; i < to; i++) {
      const d = off(
        p[2 * i],
        p[2 * i + 1],
        p[2 * from],
        p[2 * from + 1],
        p[2 * to],
        p[2 * to + 1]
      );
      if (d > far) {
        far = d;
        index = i;
      }
    }
    if (index > 0 && far > tolerance) {
      keep[index] = 1;
      todo.push([from, index], [index, to]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[2 * i], p[2 * i + 1]);
  return out;
};

/** Flat pairs rounded like a drawing's – a point the same as the one before goes. */
export const roundPoints = (p: readonly number[]) => {
  const out: number[] = [];
  for (let i = 0; i + 1 < p.length; i += 2) {
    const x = round(p[i]);
    const y = round(p[i + 1]);
    if (out.length && out[out.length - 2] === x && out[out.length - 1] === y) {
      continue;
    }
    out.push(x, y);
  }
  return out;
};
