import { describe, expect, it } from "vitest";
import {
  between,
  evenly,
  matched,
  ringPath,
} from "../../src/features/calendar/morph";
import {
  outlineCount,
  outlinePoints,
} from "../../src/features/calendar/outline";
import { ringArea } from "../../src/features/calendar/path";
import { DEFAULT_SHAPES } from "../../src/features/calendar/shapes";

type Point = [number, number];

const SQUARE: Point[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

const gaps = (ring: readonly Point[]) =>
  ring.map(([x, y], i) => {
    const [nx, ny] = ring[(i + 1) % ring.length];
    return Math.hypot(nx - x, ny - y);
  });

/** The squared distances of matched points, summed. */
const apart = (a: readonly Point[], b: readonly Point[]) =>
  a.reduce(
    (sum, [x, y], i) => sum + (x - b[i][0]) ** 2 + (y - b[i][1]) ** 2,
    0
  );

/** A ring started at its k-th point. */
const turned = (ring: readonly Point[], k: number) => [
  ...ring.slice(k),
  ...ring.slice(0, k),
];

describe("morphing one outline into another", () => {
  it("spreads a ring's points evenly along its length, from its first", () => {
    const ring = evenly(SQUARE, 8);
    expect(ring).toHaveLength(8);
    expect(ring[0]).toEqual([0, 0]);
    for (const gap of gaps(ring)) expect(gap).toBeCloseTo(0.5, 9);
    // The corners are on it – every second point.
    expect(ring[2][0]).toBeCloseTo(1, 9);
    expect(ring[2][1]).toBeCloseTo(0, 9);
  });

  it("gives both rings as many points", () => {
    const [a, b] = matched(outlinePoints("circle"), outlinePoints("star"), 150);
    expect(a).toHaveLength(150);
    expect(b).toHaveLength(150);
  });

  it("starts the second ring where it lies nearest the first", () => {
    // Evenly already – spread anew, its points stay where they are.
    const ring = evenly(SQUARE, 40);
    for (const k of [1, 7, 20, 39]) {
      const [a, b] = matched(ring, turned(ring, k), 40);
      expect(apart(a, b)).toBeLessThan(1e-20);
    }
  });

  it("finds the nearest start between different shapes, too", () => {
    const [a, b] = matched(
      outlinePoints("square"),
      turned(outlinePoints("diamond"), 40),
      96
    );
    const others = Array.from({ length: 96 }, (_, k) => apart(a, turned(b, k)));
    expect(apart(a, b)).toBe(Math.min(...others));
  });

  it("turns a ring that runs the other way round", () => {
    const ring = evenly(outlinePoints("triangle"), 90);
    const [a, b] = matched(ring, [...ring].reverse(), 90);
    expect(Math.sign(ringArea(b))).toBe(Math.sign(ringArea(a)));
    expect(apart(a, b)).toBeLessThan(1e-9);
  });

  it("matches every shape with every other without a twist", () => {
    for (const from of DEFAULT_SHAPES) {
      for (const to of DEFAULT_SHAPES) {
        const count = Math.max(outlineCount(from.key), outlineCount(to.key));
        const [a, b] = matched(
          outlinePoints(from.key),
          outlinePoints(to.key),
          count
        );
        // Halfway, it is still a ring the right way round.
        expect(ringArea(between(a, b, 0.5))).toBeGreaterThan(0);
        // Each point goes no further than across the face.
        for (let i = 0; i < count; i++) {
          expect(Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1])).toBeLessThan(
            0.75
          );
        }
      }
    }
  });

  it("goes from the first ring to the second – a spring beyond it, too", () => {
    const a: Point[] = [
      [0, 0],
      [1, 0],
    ];
    const b: Point[] = [
      [0, 2],
      [3, 0],
    ];
    expect(between(a, b, 0)).toEqual(a);
    expect(between(a, b, 1)).toEqual(b);
    expect(between(a, b, 0.5)).toEqual([
      [0, 1],
      [2, 0],
    ]);
    expect(between(a, b, 1.1)[1][0]).toBeCloseTo(3.2, 9);
  });

  it("draws a ring as a closed path", () => {
    expect(ringPath(SQUARE)).toBe(
      "M0.0000 0.0000L1.0000 0.0000L1.0000 1.0000L0.0000 1.0000Z"
    );
    expect(ringPath([])).toBe("");
  });
});
