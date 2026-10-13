import { describe, expect, it } from "vitest";
import {
  seedOf,
  TILE,
  tileOf,
  withWraps,
  wrappedDistance,
} from "../../src/features/cards/ui/tile";

describe("tileOf", () => {
  const seed = seedOf("AbCdEfGh1234");

  it("lays out the same tile for the same card", () => {
    expect(tileOf(seed)).toEqual(tileOf(seed));
    expect(tileOf(seedOf("ZzZzZzZz9876"))).not.toEqual(tileOf(seed));
  });

  it("scatters prints of different sizes, a little turned", () => {
    const prints = tileOf(seed);
    expect(prints.length).toBeGreaterThanOrEqual(TILE.count - 3);
    expect(prints.length).toBeLessThanOrEqual(TILE.count);
    for (const print of prints) {
      expect(print.x).toBeGreaterThanOrEqual(0);
      expect(print.x).toBeLessThan(TILE.width);
      expect(print.y).toBeGreaterThanOrEqual(0);
      expect(print.y).toBeLessThan(TILE.height);
      expect(print.size).toBeGreaterThanOrEqual(TILE.min);
      expect(print.size).toBeLessThanOrEqual(TILE.max);
      expect(Math.abs(print.turn)).toBeLessThanOrEqual(TILE.turn);
      expect(Number.isInteger(print.seed)).toBe(true);
    }
    const sizes = new Set(prints.map((print) => Math.round(print.size)));
    expect(sizes.size).toBeGreaterThan(prints.length / 2);
  });

  it("keeps paper between any two – across the tile's edges too", () => {
    for (const card of ["a", "b", "c", "d", "e"]) {
      const prints = tileOf(seedOf(card));
      for (const [i, a] of prints.entries()) {
        for (const b of prints.slice(i + 1)) {
          expect(
            wrappedDistance(a, b, TILE.width, TILE.height)
          ).toBeGreaterThanOrEqual((a.size + b.size) / 2 + TILE.gap - 1e-9);
        }
      }
    }
  });
});

describe("withWraps", () => {
  it("draws a print over an edge again on the other side", () => {
    const corner = { x: 10, y: 590, size: 100, turn: 0, seed: 1 };
    const middle = { x: 300, y: 300, size: 100, turn: 0, seed: 2 };
    const drawn = withWraps([corner, middle], 600, 600);
    expect(drawn.filter((print) => print.seed === 2)).toEqual([middle]);
    const copies = drawn.filter((print) => print.seed === 1);
    expect(copies.map(({ x, y }) => [x, y]).sort()).toEqual(
      [
        [10, 590],
        [10, -10],
        [610, 590],
        [610, -10],
      ].sort()
    );
  });
});

describe("wrappedDistance", () => {
  it("goes the short way round", () => {
    expect(wrappedDistance({ x: 5, y: 0 }, { x: 595, y: 0 }, 600, 600)).toBe(
      10
    );
    expect(wrappedDistance({ x: 0, y: 0 }, { x: 300, y: 400 }, 600, 600)).toBe(
      Math.hypot(300, 200)
    );
  });
});
