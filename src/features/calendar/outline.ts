import { FACE, type StampShape } from "./model";

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
    const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / (a.dx * b.dy - a.dy * b.dx);
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
