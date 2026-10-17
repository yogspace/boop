import { describe, expect, it } from "vitest";
import {
  artOf,
  BLANK,
  back,
  forward,
  type History,
  meanwhile,
  STEPS_BACK,
  settled,
  step,
} from "../../src/features/app/stamp-drawer/history";
import {
  addedIn,
  joined,
  shifted,
} from "../../src/features/app/stamp-drawer/placing";
import type { Art } from "../../src/features/calendar/art";

/** A short level line starting at x. */
const line = (x: number): Art => ({
  strokes: [{ w: 0.02, p: [x, 0.5, x + 0.1, 0.5] }],
  fills: [],
});

describe("the drawing's steps", () => {
  it("go back and forth – a new one forgets what was taken back", () => {
    let history: History = { past: [], now: BLANK, future: [] };
    history = step(history, () => line(0.1));
    history = step(history, () => line(0.2));
    history = back(history);
    expect(history.now).toEqual(line(0.1));
    expect(history.future).toEqual([line(0.2)]);
    history = forward(history);
    expect(history.now).toEqual(line(0.2));
    history = back(back(history));
    expect(history.now).toBe(BLANK);
    // Nothing further back, nothing further forward than there is.
    expect(back(history)).toEqual(history);
    expect(forward(forward(forward(history))).now).toEqual(line(0.2));
    history = step(history, () => line(0.3));
    expect(history.future).toEqual([]);
  });

  it("reach back no further than STEPS_BACK", () => {
    let history: History = { past: [], now: BLANK, future: [] };
    for (let i = 0; i < STEPS_BACK + 20; i++) {
      history = step(history, () => line(i / 1000));
    }
    expect(history.past).toHaveLength(STEPS_BACK);
  });

  it("make a gesture one step, from where it began", () => {
    const start: History = { past: [], now: line(0.1), future: [line(0.9)] };
    let history = meanwhile(line(0.2))(start);
    history = meanwhile(line(0.3))(history);
    expect(history.past).toEqual([]);
    history = settled(start.now)(history);
    expect(history).toEqual({
      past: [line(0.1)],
      now: line(0.3),
      future: [],
    });
  });

  it("begin from a copy of the stamp's drawing", () => {
    const drawing = { v: 1 as const, strokes: [{ w: 0.02, p: [0, 0, 1, 1] }] };
    const art = artOf(drawing);
    expect(art).toEqual({ strokes: drawing.strokes, fills: [] });
    expect(art.strokes).not.toBe(drawing.strokes);
    expect(artOf(null)).toBe(BLANK);
  });
});

describe("putting art into the drawing", () => {
  it("lays it on top and knows where it went", () => {
    const art: Art = {
      strokes: line(0.1).strokes,
      fills: [{ p: [[0, 0, 0.2, 0, 0.2, 0.2]] }],
    };
    const added: Art = {
      strokes: [...line(0.4).strokes, ...line(0.6).strokes],
      fills: [{ p: [[0.5, 0.5, 0.7, 0.5, 0.7, 0.7]] }],
    };
    const both = joined(art, added);
    expect(both.strokes).toHaveLength(3);
    expect(both.fills).toHaveLength(2);
    expect(addedIn(art, added)).toEqual({ strokes: [1, 2], fills: [1] });
  });

  it("moves lines, their anchors and areas alike", () => {
    const art: Art = {
      strokes: [{ w: 0.02, p: [0.1, 0.2, 0.3, 0.4], a: [0.1, 0.2, 0.1, 0.2] }],
      fills: [{ p: [[0, 0, 0.1, 0]] }],
    };
    expect(shifted(art, 0.1, -0.05)).toEqual({
      strokes: [
        { w: 0.02, p: [0.2, 0.15, 0.4, 0.35], a: [0.2, 0.15, 0.2, 0.15] },
      ],
      fills: [{ p: [[0.1, -0.05, 0.2, -0.05]] }],
    });
  });
});
