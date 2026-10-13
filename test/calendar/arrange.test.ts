import { describe, expect, it } from "vitest";
import {
  addCopies,
  apply,
  boxOf,
  everything,
  type Frame,
  frameAfter,
  frameAround,
  grip,
  isNothing,
  moveWithin,
  pinching,
  pointsOf,
  remove,
  restroke,
  type Selection,
  sizeCursor,
  sizing,
  TURN_STEP,
  thingAt,
  toggle,
  touching,
  transformArt,
  translate,
  turning,
  widthOf,
} from "../../src/features/calendar/arrange";
import type { Art } from "../../src/features/calendar/art";
import { erase } from "../../src/features/calendar/eraser";
import { DRAWING_LIMITS } from "../../src/features/calendar/model";

const art = (strokes: Art["strokes"], fills: Art["fills"] = []): Art => ({
  strokes,
  fills,
});
const only = (strokes: number[], fills: number[] = []): Selection => ({
  strokes,
  fills,
});

// A cross (two lines touching), a dot far off, and a square area.
const cross = art(
  [
    { w: 0.05, p: [0.2, 0.3, 0.4, 0.3] },
    { w: 0.05, p: [0.3, 0.2, 0.3, 0.4] },
    { w: 0.03, p: [0.8, 0.8] },
  ],
  [{ p: [[0.6, 0.1, 0.9, 0.1, 0.9, 0.4, 0.6, 0.4]] }]
);

describe("picking", () => {
  it("picks what touches as one thing", () => {
    expect(thingAt(cross, 0.22, 0.3, 0.01)).toEqual(only([0, 1]));
    expect(thingAt(cross, 0.8, 0.8, 0.01)).toEqual(only([2]));
    expect(thingAt(cross, 0.75, 0.25, 0.01)).toEqual(only([], [0]));
    expect(thingAt(cross, 0.5, 0.6, 0.01)).toBeNull();
  });

  it("joins a line drawn over an area to it", () => {
    const over = art(
      [...cross.strokes, { w: 0.03, p: [0.5, 0.25, 0.7, 0.25] }],
      cross.fills
    );
    expect(thingAt(over, 0.75, 0.25, 0.01)).toEqual(only([3], [0]));
  });

  it("parts a line erased through the middle into two things", () => {
    const one = art([{ w: 0.05, p: [0.2, 0.5, 0.8, 0.5] }]);
    const two = erase(one, { w: 0.05, p: [0.5, 0.1, 0.5, 0.9] });
    expect(two.strokes).toHaveLength(2);
    expect(thingAt(two, 0.25, 0.5, 0.01)).toEqual(only([0]));
    expect(thingAt(two, 0.75, 0.5, 0.01)).toEqual(only([1]));
  });

  it("picks all a dragged box touches – touching is enough", () => {
    // Over one end of the cross's line only: the whole cross.
    expect(touching(cross, { x0: 0.1, y0: 0.25, x1: 0.21, y1: 0.35 })).toEqual(
      only([0, 1])
    );
    // A corner of the area.
    expect(touching(cross, { x0: 0.85, y0: 0.35, x1: 0.95, y1: 0.45 })).toEqual(
      only([], [0])
    );
    // Inside the area, no outline in the box.
    expect(touching(cross, { x0: 0.7, y0: 0.2, x1: 0.75, y1: 0.25 })).toEqual(
      only([], [0])
    );
    expect(touching(cross, { x0: 0.5, y0: 0.5, x1: 0.6, y1: 0.6 })).toBeNull();
  });

  it("adds with ⇧ and takes away again", () => {
    const both = toggle(only([0, 1]), only([2]));
    expect(both).toEqual(only([0, 1, 2]));
    expect(toggle(both, only([2]))).toEqual(only([0, 1]));
    expect(isNothing(toggle(only([2]), only([2])))).toBe(true);
  });
});

describe("moving, turning, sizing", () => {
  const bar = art([{ w: 0.05, p: [0.4, 0.5, 0.6, 0.5] }]);
  const all = everything(bar);
  const frame = frameAround(
    boxOf(bar, all) as NonNullable<ReturnType<typeof boxOf>>
  );
  const points = pointsOf(bar, all);

  it("moves the points, never the width – and nothing else", () => {
    const two = art([...bar.strokes, { w: 0.03, p: [0.1, 0.1, 0.2, 0.2] }]);
    const moved = transformArt(two, only([0]), translate(0.1, -0.2));
    expect(moved.strokes[0]).toEqual({ w: 0.05, p: [0.5, 0.3, 0.7, 0.3] });
    expect(moved.strokes[1]).toBe(two.strokes[1]);
  });

  it("stops at the square's edge", () => {
    expect(moveWithin(points, 0.6, 0)).toEqual([0.4, 0]);
    expect(moveWithin(points, -0.9, 0.7)).toEqual([-0.4, 0.5]);
  });

  it("turns about the middle – in 15° steps with ⇧", () => {
    // From the right end to straight below the middle: a quarter turn.
    const m = turning(frame, points, [0.6, 0.5], [0.5, 0.7], false);
    const turned = transformArt(bar, all, m).strokes[0].p;
    expect(turned[0]).toBeCloseTo(0.5, 3);
    expect(turned[1]).toBeCloseTo(0.4, 3);
    expect(turned[3]).toBeCloseTo(0.6, 3);
    expect(frameAfter(frame, m).angle).toBeCloseTo(Math.PI / 2);
    // 17° snaps to 15°.
    const a = (17 * Math.PI) / 180;
    const snapped = turning(
      frame,
      points,
      [0.6, 0.5],
      [0.5 + Math.cos(a), 0.5 + Math.sin(a)],
      true
    );
    expect(frameAfter(frame, snapped).angle).toBeCloseTo(TURN_STEP);
  });

  it("pushes a turn back onto the face – or stops it", () => {
    const edge = art([{ w: 0.05, p: [0.05, 0.1, 0.35, 0.1] }]);
    const e = everything(edge);
    const f = frameAround(
      boxOf(edge, e) as NonNullable<ReturnType<typeof boxOf>>
    );
    const pts = pointsOf(edge, e);
    const m = turning(f, pts, [0.35, 0.1], [0.2, 0.3], false);
    for (const n of transformArt(edge, e, m).strokes[0].p) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });

  it("sizes from a side along one axis, a corner freely, ⇧ evenly, Alt about the middle", () => {
    const square = art([
      { w: 0.04, p: [0.4, 0.4, 0.6, 0.4, 0.6, 0.6, 0.4, 0.6] },
    ]);
    const s = everything(square);
    const f: Frame = { cx: 0.5, cy: 0.5, w: 0.2, h: 0.2, angle: 0 };
    const pts = pointsOf(square, s);
    const at = (m: ReturnType<typeof sizing>, x: number, y: number) =>
      apply(m, x, y).map((n) => Math.round(n * 1000) / 1000);
    // The right side out by 0.1: half as wide again, the left side stays.
    const side = sizing(f, pts, [1, 0], [0.6, 0.5], [0.7, 0.5]);
    expect(at(side, 0.4, 0.4)).toEqual([0.4, 0.4]);
    expect(at(side, 0.6, 0.6)).toEqual([0.7, 0.6]);
    // The corner, freely: wider only.
    const corner = sizing(f, pts, [1, 1], [0.6, 0.6], [0.7, 0.6]);
    expect(at(corner, 0.6, 0.6)).toEqual([0.7, 0.6]);
    // ⇧: evenly – as far as the pointer got along the diagonal.
    const even = sizing(f, pts, [1, 1], [0.6, 0.6], [0.7, 0.6], { even: true });
    expect(at(even, 0.6, 0.6)).toEqual([0.65, 0.65]);
    // Alt: about the middle – both sides go out.
    const middle = sizing(f, pts, [1, 0], [0.6, 0.5], [0.7, 0.5], {
      centered: true,
    });
    expect(at(middle, 0.4, 0.5)).toEqual([0.3, 0.5]);
    expect(at(middle, 0.6, 0.5)).toEqual([0.7, 0.5]);
    // The width stays the pen's.
    expect(transformArt(square, s, side).strokes[0].w).toBe(0.04);
  });

  it("sizes no further than the square, never flipped, never to nothing", () => {
    const f: Frame = { cx: 0.5, cy: 0.5, w: 0.2, h: 0.2, angle: 0 };
    const pts = [0.4, 0.4, 0.6, 0.6];
    const far = sizing(f, pts, [1, 1], [0.6, 0.6], [3, 3]);
    expect(apply(far, 0.6, 0.6)[0]).toBeCloseTo(1, 3);
    expect(apply(far, 0.6, 0.6)[1]).toBeCloseTo(1, 3);
    const past = sizing(f, pts, [1, 0], [0.6, 0.5], [0.1, 0.5]);
    const [left] = apply(past, 0.4, 0.5);
    const [right] = apply(past, 0.6, 0.5);
    expect(right).toBeGreaterThan(left);
    expect(right - left).toBeGreaterThanOrEqual(0.0199);
  });

  it("turns and sizes with two fingers", () => {
    const f: Frame = { cx: 0.5, cy: 0.5, w: 0.2, h: 0.2, angle: 0 };
    const pts = [0.4, 0.4, 0.6, 0.6];
    // Twice as far apart: twice the size about their middle.
    const m = pinching(
      f,
      pts,
      [
        [0.45, 0.5],
        [0.55, 0.5],
      ],
      [
        [0.4, 0.5],
        [0.6, 0.5],
      ]
    );
    expect(apply(m, 0.6, 0.6)[0]).toBeCloseTo(0.7);
    expect(frameAfter(f, m).w).toBeCloseTo(0.4);
  });

  it("keeps its frame turned as it turns", () => {
    const f: Frame = { cx: 0.5, cy: 0.5, w: 0.3, h: 0.1, angle: 0 };
    const m = turning(
      f,
      [0.35, 0.45, 0.65, 0.55],
      [0.65, 0.5],
      [0.5, 0.65],
      false
    );
    const after = frameAfter(f, m);
    expect(after.w).toBeCloseTo(0.3);
    expect(after.h).toBeCloseTo(0.1);
    expect(sizeCursor(after, [1, 0])).toBe("ns-resize");
    expect(sizeCursor(f, [1, 1])).toBe("nwse-resize");
    expect(sizeCursor(f, [1, -1])).toBe("nesw-resize");
  });
});

describe("the frame's handles", () => {
  const f: Frame = { cx: 0.5, cy: 0.5, w: 0.4, h: 0.2, angle: 0 };
  const reach = 0.02;

  it("grabs corners, sides, the inside – and the turn just outside a corner", () => {
    expect(grip(f, 0.7, 0.6, { reach })).toEqual({
      kind: "size",
      handle: [1, 1],
    });
    expect(grip(f, 0.5, 0.405, { reach })).toEqual({
      kind: "size",
      handle: [0, -1],
    });
    expect(grip(f, 0.31, 0.5, { reach })).toEqual({
      kind: "size",
      handle: [-1, 0],
    });
    expect(grip(f, 0.5, 0.5, { reach })).toEqual({ kind: "move" });
    expect(grip(f, 0.73, 0.63, { reach, turn: 0.06 })).toEqual({
      kind: "turn",
    });
    expect(grip(f, 0.73, 0.63, { reach })).toBeNull();
    // The knob above the frame, for fingers.
    expect(grip(f, 0.5, 0.35, { reach, knob: 0.05 })).toEqual({ kind: "turn" });
  });

  it("lets a small frame be moved from inside", () => {
    const small: Frame = { cx: 0.5, cy: 0.5, w: 0.03, h: 0.03, angle: 0 };
    expect(grip(small, 0.51, 0.51, { reach })).toEqual({ kind: "move" });
    expect(grip(small, 0.525, 0.525, { reach })).toEqual({
      kind: "size",
      handle: [1, 1],
    });
  });
});

describe("copies, removing, widths", () => {
  it("lays copies on top, picked, moved off a little", () => {
    const added = addCopies(
      cross,
      { strokes: [cross.strokes[2]], fills: [] },
      0.03,
      0.03
    );
    expect(added?.art.strokes).toHaveLength(4);
    expect(added?.selection).toEqual(only([3]));
    expect(added?.art.strokes[3].p).toEqual([0.83, 0.83]);
  });

  it("refuses copies a stamp can't hold", () => {
    const full = art(
      Array.from({ length: DRAWING_LIMITS.strokes }, () => ({
        w: 0.03,
        p: [0.5, 0.5],
      }))
    );
    expect(
      addCopies(full, { strokes: [full.strokes[0]], fills: [] }, 0, 0)
    ).toBeNull();
  });

  it("removes what is picked", () => {
    expect(remove(cross, only([0, 1], [0]))).toEqual(art([cross.strokes[2]]));
  });

  it("sets the picked lines' width – areas have none", () => {
    expect(widthOf(cross, only([0, 1]))).toBe(0.05);
    expect(widthOf(cross, only([0, 2]))).toBeNull();
    const thick = restroke(cross, only([0, 2], [0]), 0.085);
    expect(thick.strokes.map((s) => s.w)).toEqual([0.085, 0.05, 0.085]);
    expect(thick.fills).toBe(cross.fills);
    expect(thick.strokes[1]).toBe(cross.strokes[1]);
  });
});
