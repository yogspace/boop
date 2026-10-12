import { FACE, type RimPattern, type StampShape } from "./model";

/**
 * The stamp's outline, per shape – the same for the drawing, its print and
 * the 3D rubber. Every shape is a convex polygon with rounded corners, fit
 * into the face's box (FACE.inset from the unit square's edge, centered).
 *
 * An outline is sampled by the direction its edge faces: point i of every
 * shape faces the same way, so one shape morphs into another point by point
 * (CSS `d` transition), and its rounded corners get their fair share of the
 * points. `grow` moves the outline outwards (or inwards when negative) – the
 * rim's edges, the rubber's side – keeping it parallel, corners rounder or
 * tighter.
 *
 * Unit coordinates, y down, like the drawing.
 */

type Point = [number, number];

/** Each shape as drawn sharp, any size, centered – and its corner radius. */
const SHARP: Record<StampShape, { points: Point[]; corner: number }> = {
  circle: { points: [[0, 0]], corner: 1 },
  square: {
    points: [
      [-0.48, -0.48],
      [0.48, -0.48],
      [0.48, 0.48],
      [-0.48, 0.48],
    ],
    corner: 0.13,
  },
  // Flat sides up, down and to both sides – like a stop sign.
  octagon: {
    points: Array.from({ length: 8 }, (_, i): Point => {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      const r = 0.48 / Math.cos(Math.PI / 8);
      return [Math.cos(a) * r, Math.sin(a) * r];
    }),
    corner: 0.06,
  },
  // Pointing up.
  triangle: {
    points: [0, 1, 2].map((i): Point => {
      const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
      return [Math.cos(a), Math.sin(a)];
    }),
    corner: 0.15,
  },
  // A little taller than wide.
  diamond: {
    points: [
      [0, -1],
      [0.86, 0],
      [0, 1],
      [-0.86, 0],
    ],
    corner: 0.13,
  },
};

/** Points an SVG outline has – enough for smooth curves at any size. */
const COUNT = 96;

/**
 * A rounded convex polygon: its sharp polygon pulled in by the corner radius
 * (`core`), every outline point `radius` beyond it.
 */
type Rounded = { core: Point[]; radius: number };

/** Each edge moved inwards by `by`, the corners where they meet again. */
const shrink = (points: Point[], by: number): Point[] => {
  if (points.length < 3) return points;
  // Clockwise on screen (y down) – the inside is to the right of an edge.
  const n = points.length;
  const lines = points.map(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % n];
    const length = Math.hypot(x1 - x0, y1 - y0);
    // The inward normal.
    const nx = -(y1 - y0) / length;
    const ny = (x1 - x0) / length;
    return { x: x0 + nx * by, y: y0 + ny * by, dx: x1 - x0, dy: y1 - y0 };
  });
  return lines.map((b, i) => {
    const a = lines[(i + n - 1) % n];
    const t =
      ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / (a.dx * b.dy - a.dy * b.dx);
    return [a.x + a.dx * t, a.y + a.dy * t];
  });
};

/** The outline point facing `angle`: the core's farthest corner, plus. */
const facing = ({ core, radius }: Rounded, angle: number): Point => {
  const cx = Math.cos(angle);
  const cy = Math.sin(angle);
  let best = core[0];
  let reach = -Infinity;
  for (const p of core) {
    const d = p[0] * cx + p[1] * cy;
    if (d > reach) {
      reach = d;
      best = p;
    }
  }
  return [best[0] + cx * radius, best[1] + cy * radius];
};

/** Each shape rounded and fit into the face's box – once. */
const fitted = new Map<StampShape, Rounded>();

const shapeOf = (shape: StampShape): Rounded => {
  const hit = fitted.get(shape);
  if (hit) return hit;
  const sharp = SHARP[shape] ?? SHARP.circle;
  const rounded = {
    core: shrink(sharp.points, sharp.corner),
    radius: sharp.corner,
  };
  // Its box, measured around.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 360; i++) {
    const [x, y] = facing(rounded, (i / 360) * Math.PI * 2);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const size = 1 - 2 * FACE.inset;
  const scale = size / Math.max(maxX - minX, maxY - minY);
  const mx = (minX + maxX) / 2;
  const my = (minY + maxY) / 2;
  const fit: Rounded = {
    core: rounded.core.map(([x, y]) => [
      0.5 + (x - mx) * scale,
      0.5 + (y - my) * scale,
    ]),
    radius: rounded.radius * scale,
  };
  fitted.set(shape, fit);
  return fit;
};

/**
 * The outline as `count` points, the first facing right, then clockwise on
 * screen – unit coordinates, y down.
 */
export const outlinePoints = (
  shape: StampShape,
  grow = 0,
  count = COUNT
): Point[] => {
  const base = shapeOf(shape);
  const rounded = { core: base.core, radius: Math.max(0, base.radius + grow) };
  return Array.from({ length: count }, (_, i) =>
    facing(rounded, ((i + 0.5) / count) * Math.PI * 2)
  );
};

/** The outline as an SVG path – the same number of points for every shape. */
export const outlinePath = (shape: StampShape, grow = 0) => {
  const points = outlinePoints(shape, grow);
  return `M${points
    .map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`)
    .join("L")}Z`;
};

/**
 * The rim – the line along the outline that prints with the doodle – as one
 * line to stroke: its SVG path (also a canvas `Path2D`), how wide and with
 * which ends. The same for the drawing, its print and the 3D rubber.
 */
export type RimLine = { d: string; width: number; cap: "round" | "butt" };

/**
 * Each pattern's look (unit lengths): its line's `width`, the `period` its
 * dashes, dots or waves repeat at, how far they swing out and back
 * (`swing`), and where along the outline their middle runs (`at`, like
 * `grow`). Every one stays inside the rubber's edge – the outline grown by
 * half a plain rim (FACE.rim / 2) – and reaches no further into the face
 * than twice that.
 */
const PATTERN: Record<
  RimPattern,
  { width: number; period: number; swing: number; at: number }
> = {
  dashed: { width: 0.03, period: 0.12, swing: 0, at: 0 },
  dotted: { width: 0.034, period: 0.07, swing: 0, at: 0 },
  wave: { width: 0.022, period: 0.12, swing: 0.011, at: -0.004 },
  zigzag: { width: 0.02, period: 0.09, swing: 0.012, at: -0.004 },
  scallop: { width: 0.02, period: 0.13, swing: 0.019, at: -0.012 },
  // Two lines – `swing` apart from the middle each way.
  double: { width: 0.014, period: 0, swing: 0.014, at: -0.003 },
};

/** How much of a dash's period it covers – the rest, less its ends, is gap. */
const DASH = 0.42;

/**
 * Cut into an inverted face (stamp-svg.tsx), the pattern runs this far
 * further in – the face keeps a solid edge outside it.
 */
const CUT_IN = 0.04;

/** Points per unit of length along the outline, for curves and dashes. */
const DENSE = 720;

/**
 * Walking along the outline (grown by `grow`): where you are after `s`
 * units, and the way out there (unit vector) – the outline's points face
 * evenly round (outlinePoints), so between them the way out turns smoothly.
 */
const walk = (shape: StampShape, grow: number) => {
  const points = outlinePoints(shape, grow, DENSE);
  const lengths = [0];
  for (let i = 1; i <= DENSE; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i % DENSE];
    lengths.push(lengths[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  const length = lengths[DENSE];
  const at = (distance: number) => {
    const s = ((distance % length) + length) % length;
    // The stretch it lies on – found by halving.
    let lo = 0;
    let hi = DENSE;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (lengths[mid] <= s) lo = mid;
      else hi = mid;
    }
    const span = lengths[lo + 1] - lengths[lo];
    const t = span > 0 ? (s - lengths[lo]) / span : 0;
    const [ax, ay] = points[lo];
    const [bx, by] = points[(lo + 1) % DENSE];
    const a0 = ((lo + 0.5) / DENSE) * Math.PI * 2;
    const a1 = ((lo + 1.5) / DENSE) * Math.PI * 2;
    const nx = Math.cos(a0) * (1 - t) + Math.cos(a1) * t;
    const ny = Math.sin(a0) * (1 - t) + Math.sin(a1) * t;
    const n = Math.hypot(nx, ny) || 1;
    return {
      x: ax + (bx - ax) * t,
      y: ay + (by - ay) * t,
      nx: nx / n,
      ny: ny / n,
    };
  };
  return { length, at };
};

const xy = (x: number, y: number) => `${x.toFixed(4)} ${y.toFixed(4)}`;

/** Rims drawn already – each shape, pattern and size once. */
const rims = new Map<string, RimLine>();

/**
 * The rim of a stamp with this `shape` and `pattern` (none: plain – the
 * outline itself, FACE.rim wide). Dashes, dots, waves and zigzags come round
 * in whole periods, so they meet seamlessly. `cut`: cut into an inverted
 * face – a little further in. `scale` makes the pattern's lines, periods and
 * swings bigger, the outline staying – for a small picture of it (a button).
 */
export const rimLine = (
  shape: StampShape,
  pattern: RimPattern | undefined,
  { cut = false, scale = 1 } = {}
): RimLine => {
  const key = `${shape}|${pattern}|${cut}|${scale}`;
  const hit = rims.get(key);
  if (hit) return hit;
  const look = pattern && PATTERN[pattern];
  const inward = cut ? CUT_IN : 0;
  if (!look) {
    const plain: RimLine = {
      d: outlinePath(shape, -inward),
      width: FACE.rim * scale,
      cap: "butt",
    };
    rims.set(key, plain);
    return plain;
  }
  const width = look.width * scale;
  const swing = look.swing * scale;
  const middle = look.at * scale - inward;
  let d = "";
  if (pattern === "double") {
    d = [middle + swing, middle - swing]
      .map((grow) => outlinePath(shape, grow))
      .join("");
  } else {
    const { length, at } = walk(shape, middle);
    const periods = Math.max(4, Math.round(length / (look.period * scale)));
    const period = length / periods;
    if (pattern === "dashed" || pattern === "dotted") {
      // Each dash runs along the outline, its round ends past it.
      const dash = pattern === "dashed" ? period * DASH : 0.0001;
      const steps = Math.max(1, Math.ceil((dash * DENSE) / length));
      for (let i = 0; i < periods; i++) {
        const from = i * period - dash / 2;
        for (let j = 0; j <= steps; j++) {
          const p = at(from + (dash * j) / steps);
          d += `${j ? "L" : "M"}${xy(p.x, p.y)}`;
        }
      }
    } else {
      // A line swinging in and out along the outline: out at the middle of
      // each period.
      const offset = (u: number) => {
        if (pattern === "wave") return -Math.cos(u * Math.PI * 2);
        if (pattern === "zigzag") return 1 - 4 * Math.abs(u - 0.5);
        // Scallops: round arches out, meeting in points.
        return 2 * Math.sin(u * Math.PI) - 1;
      };
      // Zigzags need their corners – the steps meet them exactly.
      const perPeriod = pattern === "zigzag" ? 8 : 16;
      const count = periods * perPeriod;
      for (let i = 0; i < count; i++) {
        const s = (i / count) * length;
        const p = at(s);
        const by = swing * offset((i % perPeriod) / perPeriod);
        d += `${i ? "L" : "M"}${xy(p.x + p.nx * by, p.y + p.ny * by)}`;
      }
      d += "Z";
    }
  }
  const line: RimLine = {
    d,
    width,
    cap: pattern === "double" ? "butt" : "round",
  };
  rims.set(key, line);
  return line;
};
