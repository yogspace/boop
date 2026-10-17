// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { outlineDistance } from "../../calendar/outline";
import {
  DEFAULT_SHAPES,
  outlineOf,
  type ShapeLike,
} from "../../calendar/shapes";
import { footOf } from "./knob";
import { heightMap } from "./maps";
import { BLOCK, PLATE, RUBBER } from "./measures";
import { distanceTo, localOutline, type Point } from "./outlines";

/**
 * The plate on the stamp's back: its outline, and “boop” pressed into it –
 * where it fits on the shape, drawn into the plate's height map.
 */

/**
 * “boop” as single strokes – the watermark. Letters in a box with x-height
 * 0.55 and ascender 1; each is lines and a round bowl.
 */
const ring = (cx: number, cy: number, r: number, from = 0) =>
  Array.from({ length: 33 }, (_, i): [number, number] => {
    const a = from + (i / 32) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });

const LETTERS: [number, number][][][] = [
  [
    [
      [0, 1],
      [0, 0.02],
    ],
    ring(0.27, 0.27, 0.26, Math.PI),
  ],
  [ring(0.27, 0.27, 0.26)],
  [ring(0.27, 0.27, 0.26)],
  [
    [
      [0, 0.53],
      [0, -0.42],
    ],
    ring(0.27, 0.27, 0.26, Math.PI),
  ],
];
const ADVANCE = 0.72;

/**
 * Where the watermark fits on a plate: its baseline (`at`, towards the
 * stamp's +Y edge when positive) and its size – none where there is no room.
 */
type Mark = { at: number; size: number } | null;

/** On the five shapes stamps had before the CMS's (shapes.ts): as always. */
const MARKS: Record<string, Mark> = {
  circle: { at: 0.31, size: 0.12 },
  square: { at: 0.31, size: 0.12 },
  octagon: { at: 0.3, size: 0.12 },
  triangle: { at: -0.25, size: 0.1 },
  diamond: null,
};

/** The watermark's width, as a share of its size. */
const MARK_WIDTH = (LETTERS.length - 1) * ADVANCE + 0.54;

const marks = new Map<string, Mark>();

/**
 * Where the watermark fits on a shape's plate (`plate`, its outline in the
 * model's units): the biggest it can be, between the knob's foot and the
 * plate's edge – above the knob if it can, else below.
 */
export const markOf = (shape: ShapeLike, plate: Point[]): Mark => {
  const d = outlineOf(shape);
  const known = DEFAULT_SHAPES.find((own) => own.d === d);
  if (known && known.key in MARKS) return MARKS[known.key];
  const hit = marks.get(d);
  if (hit !== undefined) return hit;
  const distance = distanceTo(plate);
  const foot = footOf() + 0.02;
  let found: Mark = null;
  for (let size = 0.12; size >= 0.06 && !found; size -= 0.005) {
    for (const side of [1, -1]) {
      for (let at = 0.15; at <= 0.48 && !found; at += 0.005) {
        const a = side * at;
        const turn = a > 0 ? -1 : 1;
        const ys = [a + turn * -0.42 * size, a + turn * size];
        let fits = true;
        for (let i = 0; i <= 8 && fits; i++) {
          for (let j = 0; j <= 4 && fits; j++) {
            const x = (-MARK_WIDTH / 2 + (MARK_WIDTH * i) / 8) * size;
            const y = ys[0] + ((ys[1] - ys[0]) * j) / 4;
            if (distance(x, y) > -0.02 || Math.hypot(x, y) < foot) fits = false;
          }
        }
        if (fits) found = { at: a, size };
      }
      if (found) break;
    }
  }
  marks.set(d, found);
  return found;
};

/**
 * The watermark on the plate, drawn into its height map (unit square, y
 * down). The plate is turned to face −Z (the stamp's back), so the lettering
 * is read from outside: at the +Y edge it is laid out turned round – its
 * baseline towards the edge – at the −Y edge upright; either way it rises
 * towards the knob.
 */
export const watermarkMap = (mark: Mark) =>
  heightMap((ctx) => {
    if (!mark) return;
    const { at, size } = mark;
    const turn = at > 0 ? -1 : 1;
    const width = MARK_WIDTH;
    ctx.lineWidth = 0.032;
    LETTERS.forEach((letter, n) => {
      for (const points of letter) {
        ctx.beginPath();
        points.forEach(([gx, gy], i) => {
          const x = turn * (n * ADVANCE + gx - width / 2) * size;
          const y = at + turn * gy * size;
          // Local (y up) to the map's unit square (y down).
          if (i) ctx.lineTo(x + 0.5, 0.5 - y);
          else ctx.moveTo(x + 0.5, 0.5 - y);
        });
        ctx.stroke();
      }
    });
  });

/**
 * The plate's outline: the stamp's, smaller round its middle – or, where
 * that would reach over the back's edge (a shape that bends round, a long
 * thin one), the back's own drawn in.
 */
export const plateOf = (shape: ShapeLike): Point[] => {
  const scaled = localOutline(shape, RUBBER.grow, PLATE.size);
  const distance = outlineDistance(shape);
  const fits = scaled.every(
    ([x, y]) => distance(0.5 + x, 0.5 - y) < RUBBER.grow - BLOCK.bevel - 0.01
  );
  return fits ? scaled : localOutline(shape, RUBBER.grow - PLATE.inset);
};
