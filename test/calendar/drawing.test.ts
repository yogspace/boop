import { describe, expect, it } from "vitest";
import {
  cleanDrawing,
  FACE,
  RIMS,
  SHAPES,
} from "../../src/features/calendar/model";
import { outlinePoints, rimLine } from "../../src/features/calendar/outline";

const strokes = [{ w: 0.05, p: [0.2, 0.2, 0.8, 0.8] }];

describe("a drawing from a device", () => {
  it("keeps a known rim pattern and a special mark", () => {
    expect(cleanDrawing({ v: 1, strokes, rim: "wave", special: true })).toEqual(
      { v: 1, strokes, rim: "wave", special: true }
    );
    expect(
      cleanDrawing({ v: 1, strokes, inverted: true, rim: "double" })
    ).toEqual({ v: 1, strokes, inverted: true, rim: "double" });
  });

  it("drops what it doesn't know – a plain rim, a plain stamp", () => {
    for (const junk of [
      { rim: "lace" },
      { rim: 3 },
      { rim: "plain" },
      { special: "yes" },
      { special: 1 },
      { special: false },
    ]) {
      expect(cleanDrawing({ v: 1, strokes, ...junk })).toEqual({
        v: 1,
        strokes,
      });
    }
  });
});

/** The points of an SVG path of lines – each move starts a new part. */
const parts = (d: string) =>
  d
    .split("M")
    .filter(Boolean)
    .map((part) =>
      part
        .replace("Z", "")
        .split("L")
        .map((pair) => pair.trim().split(" ").map(Number) as [number, number])
    );

/** Whether a point lies inside a convex outline (clockwise on screen). */
const inside = ([x, y]: [number, number], outline: [number, number][]) =>
  outline.every(([ax, ay], i) => {
    const [bx, by] = outline[(i + 1) % outline.length];
    // Clockwise with y down: the inside is to the right of every edge.
    return (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= -1e-9;
  });

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

describe("the rim's patterns", () => {
  it("stay inside the rubber's edge – line and all", () => {
    for (const shape of SHAPES) {
      for (const pattern of [undefined, ...RIMS]) {
        for (const cut of [false, true]) {
          const { d, width } = rimLine(shape, pattern, { cut });
          // The edge, less half the line (and a hair for rounding).
          const room = outlinePoints(
            shape,
            FACE.rim / 2 - width / 2 + 0.001,
            360
          );
          for (const points of parts(d)) {
            for (const point of points) {
              expect(inside(point, room), `${shape} ${pattern}`).toBe(true);
            }
          }
        }
      }
    }
  });

  it("come round seamlessly – no jump where they close", () => {
    for (const shape of SHAPES) {
      for (const pattern of ["wave", "zigzag", "scallop"] as const) {
        const [points] = parts(rimLine(shape, pattern).d);
        const steps = points.map(([x, y], i) => {
          const [nx, ny] = points[(i + 1) % points.length];
          return Math.hypot(nx - x, ny - y);
        });
        // The closing step is no longer than the others.
        expect(steps.at(-1)).toBeLessThan(median(steps) * 2.5);
        // Whole periods: the same at the end as at the start.
        expect(points.length % 8).toBe(0);
      }
    }
  });

  it("space dashes and dots evenly – across the start, too", () => {
    for (const shape of SHAPES) {
      for (const pattern of ["dashed", "dotted"] as const) {
        const starts = parts(rimLine(shape, pattern).d).map((p) => p[0]);
        expect(starts.length).toBeGreaterThan(20);
        const gaps = starts.map(([x, y], i) => {
          const [nx, ny] = starts[(i + 1) % starts.length];
          return Math.hypot(nx - x, ny - y);
        });
        expect(Math.max(...gaps)).toBeLessThan(median(gaps) * 1.3);
        expect(Math.min(...gaps)).toBeGreaterThan(median(gaps) * 0.6);
      }
    }
  });

  it("is the outline itself when plain", () => {
    const plain = rimLine("circle", undefined);
    expect(plain.width).toBe(FACE.rim);
    expect(parts(plain.d)).toHaveLength(1);
    expect(parts(rimLine("square", "double").d)).toHaveLength(2);
  });
});
