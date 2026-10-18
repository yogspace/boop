import type { PointerEvent } from "react";
import { describe, expect, it } from "vitest";
import {
  frameFor,
  type Gesture,
  selectGestures,
} from "../../src/features/app/stamp-drawer/select-gestures";
import type { Picked } from "../../src/features/app/use-select";
import type { Selection } from "../../src/features/calendar/arrange";
import type { Art, Point } from "../../src/features/calendar/art";

const only = (strokes: number[], fills: number[] = []): Selection => ({
  strokes,
  fills,
});

// A line across, and a copy of it laid over it upright – they touch.
const art: Art = {
  strokes: [
    { w: 0.05, p: [0.2, 0.5, 0.6, 0.5] },
    { w: 0.05, p: [0.4, 0.3, 0.4, 0.7] },
  ],
  fills: [],
};

/** The tool with the copy picked – loose or not – pressed where both lie. */
const pressOnBoth = (loose: Selection | null) => {
  const copy = only([1]);
  const frame = frameFor(art, copy);
  if (!frame) throw new Error("No frame");
  const latest = { current: { art, picked: { items: copy, frame, art } } } as {
    current: { art: Art; picked: Picked | null };
  };
  const gesture = { current: null as Gesture | null };
  const noop = () => {};
  const { down } = selectGestures({
    locate: ({ clientX, clientY }) => ({ x: clientX, y: clientY, unit: 1000 }),
    settle: noop,
    touchy: false,
    setTouchy: noop,
    setHover: noop,
    setMarquee: noop,
    setLines: noop,
    gesture,
    fingers: { current: new Map<number, Point>() },
    pressed: { current: { time: 0, x: 0, y: 0 } },
    latest,
    choose: (next) => {
      latest.current.picked = next;
    },
    chooseIn: noop,
    show: noop,
    loose: { current: loose },
  });
  down({
    pointerType: "mouse",
    button: 0,
    pointerId: 1,
    clientX: 0.4,
    clientY: 0.5,
    timeStamp: 1000,
    shiftKey: false,
    altKey: false,
    currentTarget: { setPointerCapture: noop, style: {} },
  } as unknown as PointerEvent<HTMLElement>);
  return { gesture: gesture.current, picked: latest.current.picked };
};

describe("a pasted copy", () => {
  it("moves alone while it is loose, whatever it touches", () => {
    const { gesture, picked } = pressOnBoth(only([1]));
    expect(gesture?.kind).toBe("move");
    expect(gesture && "items" in gesture && gesture.items).toEqual(only([1]));
    expect(picked?.items).toEqual(only([1]));
  });

  it("is one with what it touches once placed", () => {
    const { gesture, picked } = pressOnBoth(null);
    expect(gesture?.kind).toBe("move");
    expect(picked?.items).toEqual(only([0, 1]));
  });
});
