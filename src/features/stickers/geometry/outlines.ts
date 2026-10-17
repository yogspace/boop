// Relative, not `@/…`: the unit tests import this without the app's aliases.
import {
  outlineCount,
  outlinePoints,
  ringDistance,
} from "../../calendar/outline";
import { outlineOf, type ShapeLike } from "../../calendar/shapes";

/**
 * The shape's outlines in the model's units (build.ts), and how far points
 * are from them – each worked out once, shared by every stamp of its shape.
 */

/** Points of the outlines in 3D – at least, and per point an outline needs. */
const OUTLINE = 360;
const OUTLINE_PER = 2;

export type Point = [number, number];

/** How many points an outline has in 3D. */
export const pointsOf = (shape: ShapeLike) =>
  Math.max(OUTLINE, outlineCount(shape) * OUTLINE_PER);

/** The outlines in the model's units – each shape, grow and scale once. */
const locals = new Map<string, Point[]>();

/**
 * The shape's outline (outline.ts) in the model's units: centered, y up,
 * `scale`d about the middle – counter-clockwise, as three.js likes it.
 * Shared by every stamp of that shape: read, never changed.
 */
export const localOutline = (shape: ShapeLike, grow: number, scale = 1) => {
  const key = `${outlineOf(shape)}|${grow}|${scale}`;
  let points = locals.get(key);
  if (!points) {
    points = outlinePoints(shape, grow, pointsOf(shape))
      .map(([x, y]): Point => [(x - 0.5) * scale, (0.5 - y) * scale])
      .reverse();
    locals.set(key, points);
  }
  return points;
};

/**
 * How far points are from a ring in the model's units – negative inside. A
 * distance is quick only round the unit square (outline/field.ts looks
 * things up in a grid there): the ring is moved there, by half a unit, and
 * so is every point asked about.
 */
const localDistance = (ring: readonly Point[]) => {
  const at = ringDistance(ring.map(([x, y]): Point => [x + 0.5, y + 0.5]));
  return (x: number, y: number) => at(x + 0.5, y + 0.5);
};

/** Points nearer than this to a straight line through their neighbours are on it. */
export const STRAIGHT = 1e-5;

/** Twice the area a ring encloses – positive counter-clockwise (y up). */
export const areaOf = (ring: readonly Point[]) => {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % ring.length];
    sum += ax * by - bx * ay;
  }
  return sum;
};

const distances = new WeakMap<
  readonly Point[],
  (x: number, y: number) => number
>();

/**
 * How far points are from an outline (localOutline's) – negative inside.
 * Worked out once per outline, which every stamp of its shape shares.
 */
export const distanceTo = (outline: readonly Point[]) => {
  let distance = distances.get(outline);
  if (!distance) {
    distance = localDistance(
      areaOf(outline) < 0 ? [...outline].reverse() : outline
    );
    distances.set(outline, distance);
  }
  return distance;
};
