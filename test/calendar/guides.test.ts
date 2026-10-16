import { describe, expect, it } from "vitest";
import type { Art } from "../../src/features/calendar/art";
import {
  guidesFor,
  linesAt,
  snapMove,
  snapPoint,
} from "../../src/features/calendar/guides";

// Two things apart: a dot near the top left, a bar on the right.
const art: Art = {
  strokes: [
    { w: 0.04, p: [0.2, 0.2] },
    { w: 0.02, p: [0.7, 0.3, 0.7, 0.6] },
  ],
  fills: [],
};

describe("smart guides", () => {
  it("are the face's middle, its rim's inner edge, and the others' edges and middles", () => {
    const guides = guidesFor(art, { strokes: [0], fills: [] });
    const has = (list: number[], v: number) =>
      list.some((x) => Math.abs(x - v) < 1e-9);
    const near = (list: number[], v: number) =>
      list.some((x) => Math.abs(x - v) < 1e-4);
    for (const v of [0.5, 0.04, 0.96]) expect(near(guides.x, v)).toBe(true);
    // The bar's edges (its width counted) and middle – not the dot's own.
    for (const v of [0.69, 0.7, 0.71]) expect(has(guides.x, v)).toBe(true);
    for (const v of [0.29, 0.45, 0.61]) expect(has(guides.y, v)).toBe(true);
    expect(has(guides.x, 0.18)).toBe(false);
  });

  it("follow the shape – its rim's inner edge where it reaches furthest", () => {
    const near = (list: number[], v: number) =>
      list.some((x) => Math.abs(x - v) < 1e-3);
    // The oval lies: wide as the face, two thirds as tall.
    const guides = guidesFor(art, { strokes: [0], fills: [] }, "oval");
    for (const v of [0.04, 0.96]) expect(near(guides.x, v)).toBe(true);
    for (const v of [0.184, 0.816]) expect(near(guides.y, v)).toBe(true);
    expect(near(guides.y, 0.04)).toBe(false);
  });

  it("pull a box's middle onto the face's – centered", () => {
    const box = { x0: 0.18, y0: 0.18, x1: 0.22, y1: 0.22 };
    const guides = guidesFor(art, { strokes: [0], fills: [] });
    // Moved to 0.497 across: pulled the last bit onto the middle.
    const [dx, dy] = snapMove(box, 0.297, 0.1, guides, 0.005);
    expect(box.x0 + dx + 0.02).toBeCloseTo(0.5, 9);
    expect(dy).toBe(0.1);
    expect(
      linesAt({ x0: 0.48, y0: 0.28, x1: 0.52, y1: 0.32 }, guides).x
    ).toEqual([0.5]);
  });

  it("let go further off – and leave an axis that may not move", () => {
    const box = { x0: 0.18, y0: 0.18, x1: 0.22, y1: 0.22 };
    const guides = guidesFor(art, { strokes: [0], fills: [] });
    expect(snapMove(box, 0.29, 0, guides, 0.005)).toEqual([0.29, 0]);
    // The middle level with the bar's: pulled down – not when held level.
    const [, dy] = snapMove(box, 0, 0.247, guides, 0.005);
    expect(0.2 + dy).toBeCloseTo(0.45, 9);
    expect(
      snapMove(box, 0, 0.247, guides, 0.005, { x: true, y: false })
    ).toEqual([0, 0.247]);
  });

  it("pull the nearest edge, middle or line – one per axis", () => {
    const guides = { x: [0.3, 0.32], y: [] };
    const box = { x0: 0.1, y0: 0, x1: 0.2, y1: 0.1 };
    // Right edge 0.2 + 0.111 = 0.311: 0.3 and 0.32 both near, 0.32 nearer.
    const [dx] = snapMove(box, 0.111, 0, guides, 0.02);
    expect(box.x1 + dx).toBeCloseTo(0.32, 9);
  });

  it("snap a point – a handle, a new anchor", () => {
    const guides = { x: [0.5], y: [0.25] };
    expect(snapPoint(0.503, 0.3, guides, 0.005)).toEqual({
      x: 0.5,
      y: 0.3,
      lines: { x: [0.5], y: [] },
    });
    expect(
      snapPoint(0.503, 0.252, guides, 0.005, { x: false, y: true })
    ).toEqual({
      x: 0.503,
      y: 0.25,
      lines: { x: [], y: [0.25] },
    });
  });
});
