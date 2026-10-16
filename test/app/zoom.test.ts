import { describe, expect, it } from "vitest";
import {
  keptView,
  MAX_ZOOM,
  movedBy,
  pinched,
  toBox,
  toFace,
  WHOLE,
  zoomedAbout,
} from "../../src/features/app/use-zoom";

describe("zooming into a drawing", () => {
  it("keeps what is under the pointer under it", () => {
    const view = zoomedAbout(WHOLE, 2, 0.25, 0.75);
    expect(view.s).toBe(2);
    const [fx, fy] = toFace(view, 0.25, 0.75);
    expect(fx).toBeCloseTo(0.25, 9);
    expect(fy).toBeCloseTo(0.75, 9);
    const [bx, by] = toBox(view, fx, fy);
    expect(bx).toBeCloseTo(0.25, 9);
    expect(by).toBeCloseTo(0.75, 9);
  });

  it("never goes beside the face, nor out further than all of it", () => {
    expect(keptView({ s: 0.5, x: 0.3, y: -2 })).toEqual(WHOLE);
    expect(keptView({ s: 99, x: 0, y: 0 }).s).toBe(MAX_ZOOM);
    const moved = movedBy({ s: 2, x: -0.5, y: -0.5 }, 5, -5);
    expect(moved).toEqual({ s: 2, x: 0, y: -1 });
  });

  it("follows two fingers – apart it zooms, along it moves", () => {
    const from = WHOLE;
    const view = pinched(
      from,
      [
        [0.4, 0.5],
        [0.6, 0.5],
      ],
      [
        [0.3, 0.5],
        [0.7, 0.5],
      ]
    );
    expect(view.s).toBeCloseTo(2, 9);
    // The point between them stays between them.
    const [fx] = toFace(view, 0.5, 0.5);
    expect(fx).toBeCloseTo(0.5, 9);
    const along = pinched(
      { s: 2, x: -0.5, y: -0.5 },
      [
        [0.4, 0.5],
        [0.6, 0.5],
      ],
      [
        [0.5, 0.5],
        [0.7, 0.5],
      ]
    );
    expect(along.s).toBeCloseTo(2, 9);
    expect(along.x).toBeCloseTo(-0.4, 9);
  });
});
