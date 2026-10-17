import { FACE, type RimPattern } from "./model";
import { type Distance, type Field, ringField } from "./outline/field";
import { onto, trace } from "./outline/trace";
import { corners, type Point, readPath, ringOf } from "./path";
import { DEFAULT_SHAPES, outlineOf, type ShapeLike } from "./shapes";

/**
 * The stamp's outline – the same for the drawing, its print and the 3D
 * rubber – worked out from its shape's path (shapes.ts), any path: the
 * largest closed piece of it, flattened finely, fit into the face's box
 * (FACE.inset from the unit square's edge, as large as it goes, centered).
 *
 * `grow` moves the outline outwards (or inwards when negative) – the rim's
 * edges, the rubber's side – keeping it parallel: it is traced where the
 * distance to the outline is `grow` (round round corners, never crossing
 * itself; outline/field.ts, outline/trace.ts). Every outline is sampled
 * evenly along its length, from where it crosses the box's middle line
 * furthest right, clockwise on screen – as many points as its shape needs
 * (`outlineCount`); morph.ts matches two shapes' up, so one morphs into
 * the other.
 *
 * Unit coordinates, y down, like the drawing.
 */

export type { Distance } from "./outline/field";
export { ringDistance } from "./outline/field";

/**
 * Points an outline has – enough for smooth curves at any size; a shape
 * with fine detail (a postage stamp's teeth) twice, four or eight times
 * that, as many as it needs to stay within `TRUE` of itself.
 */
const COUNTS = [96, 192, 384, 768];
const TRUE = 0.0012;

/** A shape's outline, fit into the face – and how far points are from it. */
type Geometry = {
  /** Tells its samples apart from other shapes'. */
  id: number;
  ring: Point[];
  /** Made when first asked for – the plain outline needs none. */
  field: () => Field;
  /** How many points its outline needs – found when first asked for. */
  count?: number;
};

const geometries = new Map<string, Geometry>();
let made = 0;

/** A square, should not even the code's first shape draw. */
const SQUARE: Point[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];

/** The outline a shape's path draws, fit into the face – once per path. */
const geometryOf = (shape: ShapeLike): Geometry => {
  const d = outlineOf(shape);
  const hit = geometries.get(d);
  if (hit) return hit;
  const raw =
    ringOf(readPath(d)) ?? ringOf(readPath(DEFAULT_SHAPES[0].d)) ?? SQUARE;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of raw) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const scale = (1 - 2 * FACE.inset) / Math.max(maxX - minX, maxY - minY);
  const mx = (minX + maxX) / 2;
  const my = (minY + maxY) / 2;
  const ring = raw.map(
    ([x, y]): Point => [0.5 + (x - mx) * scale, 0.5 + (y - my) * scale]
  );
  let field: Field | null = null;
  const geometry: Geometry = {
    id: made++,
    ring,
    field: () => {
      field ??= ringField(ring);
      return field;
    },
  };
  geometries.set(d, geometry);
  return geometry;
};

/** How far a shape's outline is from a point of the face – negative inside. */
export const outlineDistance = (shape: ShapeLike): Distance =>
  geometryOf(shape).field().at;

const probed = new Float64Array(3);

/** Where a ring crosses the line `y` furthest right – and after which point. */
const crossing = (ring: readonly Point[], y: number) => {
  let best: { x: number; after: number } | null = null;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    if (y0 > y === y1 > y) continue;
    const x = x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
    if (!best || x > best.x) best = { x, after: i };
  }
  return best;
};

/** An outline's points – and which way is out at each (unit vectors). */
type Sampled = { points: Point[]; normals: Point[] };

const sampledCache = new Map<string, Sampled>();

/** A closed line of points, `count` evenly along it from its first. */
const resample = (line: readonly Point[], count: number): Point[] => {
  const lengths = [0];
  for (let i = 1; i <= line.length; i++) {
    const [ax, ay] = line[i - 1];
    const [bx, by] = line[i % line.length];
    lengths.push(lengths[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  const total = lengths[line.length];
  const points: Point[] = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    // Each half a step on from a whole one, so a shape that is the same
    // upside down has its points mirrored too.
    const s = ((i + 0.5) / count) * total;
    while (lengths[j + 1] < s) j++;
    const t = (s - lengths[j]) / (lengths[j + 1] - lengths[j] || 1);
    const [ax, ay] = line[j];
    const [bx, by] = line[(j + 1) % line.length];
    points.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
  }
  return points;
};

const sampled = (shape: ShapeLike, grow: number, count: number): Sampled => {
  const geometry = geometryOf(shape);
  const key = `${geometry.id}|${grow}|${count}`;
  const hit = sampledCache.get(key);
  if (hit) return hit;
  const field = geometry.field();
  let points: Point[];
  if (grow === 0) {
    // The outline itself, from where it crosses the middle line on the right.
    const ring = geometry.ring;
    const cut = crossing(ring, 0.5);
    const line = cut
      ? [
          [cut.x, 0.5] as Point,
          ...ring.slice(cut.after + 1),
          ...ring.slice(0, cut.after + 1),
        ]
      : ring;
    points = resample(line, count);
  } else {
    points = resample(trace(field, grow, 0.5), count).map(([x, y]) =>
      onto(field, grow, x, y)
    );
  }
  const normals = points.map(([x, y]): Point => {
    field.probe(x, y, probed);
    return [probed[1], probed[2]];
  });
  const out = { points, normals };
  sampledCache.set(key, out);
  return out;
};

/**
 * How many points a shape's outline needs (COUNTS): the fewest whose straight
 * lines between them stay within TRUE of it.
 */
export const outlineCount = (shape: ShapeLike): number => {
  const geometry = geometryOf(shape);
  if (geometry.count) return geometry.count;
  const at = geometry.field().at;
  const count =
    COUNTS.find((n) => {
      const { points } = sampled(shape, 0, n);
      return points.every(([x, y], i) => {
        const [nx, ny] = points[(i + 1) % n];
        return Math.abs(at((x + nx) / 2, (y + ny) / 2)) <= TRUE;
      });
    }) ?? COUNTS[COUNTS.length - 1];
  geometry.count = count;
  return count;
};

/**
 * The outline as `count` points (as many as it needs, `outlineCount`), the
 * first on the right, then clockwise on screen – unit coordinates, y down.
 */
export const outlinePoints = (
  shape: ShapeLike,
  grow = 0,
  count = outlineCount(shape)
): Point[] => sampled(shape, grow, count).points;

/** An SVG outline keeps to the shape within this – far finer than a pixel. */
const SHARP = 0.0004;

/** Outlines as SVG paths – each shape and size once. */
const paths = new Map<string, string>();

/**
 * The outline as an SVG path – only the points it needs to keep its shape
 * (a straight side is two), from where it crosses the middle line on the
 * right.
 */
export const outlinePath = (shape: ShapeLike, grow = 0) => {
  const key = `${geometryOf(shape).id}|${grow}`;
  const hit = paths.get(key);
  if (hit) return hit;
  const dense = outlinePoints(shape, grow, outlineCount(shape) * 8);
  const d = `M${corners(dense, SHARP)
    .map((k) => `${dense[k][0].toFixed(4)} ${dense[k][1].toFixed(4)}`)
    .join("L")}Z`;
  paths.set(key, d);
  return d;
};

/** The outline's box (grown by `grow`) – where its edges are, each way. */
export const outlineBox = (shape: ShapeLike, grow = 0) => {
  const points = grow
    ? outlinePoints(shape, grow, 1440)
    : geometryOf(shape).ring;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
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
 * half a plain rim (FACE.rim / 2) – and reaches at most 0.05 into the face.
 */
const PATTERN: Record<
  RimPattern,
  { width: number; period: number; swing: number; at: number }
> = {
  dashed: { width: 0.034, period: 0.12, swing: 0, at: -0.001 },
  dotted: { width: 0.036, period: 0.075, swing: 0, at: -0.001 },
  wave: { width: 0.028, period: 0.12, swing: 0.012, at: -0.008 },
  zigzag: { width: 0.026, period: 0.1, swing: 0.013, at: -0.008 },
  scallop: { width: 0.026, period: 0.15, swing: 0.021, at: -0.016 },
  // Two lines – `swing` apart from the middle each way.
  double: { width: 0.018, period: 0, swing: 0.017, at: -0.008 },
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
 * units, and the way out there (unit vector) – between two of the outline's
 * points the way out turns smoothly from one's to the other's.
 */
const walk = (shape: ShapeLike, grow: number) => {
  const { points, normals } = sampled(shape, grow, DENSE);
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
    const [ux, uy] = normals[lo];
    const [vx, vy] = normals[(lo + 1) % DENSE];
    const nx = ux * (1 - t) + vx * t;
    const ny = uy * (1 - t) + vy * t;
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
  shape: ShapeLike,
  pattern: RimPattern | undefined,
  { cut = false, scale = 1 } = {}
): RimLine => {
  const key = `${geometryOf(shape).id}|${pattern}|${cut}|${scale}`;
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
