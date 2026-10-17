import { type RefObject, useEffect, useRef, useState } from "react";
import {
  addCopies,
  everything,
  type Frame,
  frameAfter,
  isNothing,
  moveWithin,
  pick,
  pointsOf,
  remove,
  restroke,
  type Selection,
  transformArt,
  translate,
  widthOf,
} from "@/features/calendar/arrange";
import type { Art, Box, Point } from "@/features/calendar/art";
import type { Guides } from "@/features/calendar/guides";
import type { ShapeLike } from "@/features/calendar/shapes";
import {
  frameFor,
  type Gesture,
  selectGestures,
} from "./stamp-drawer/select-gestures";

export { KNOB } from "./stamp-drawer/select-gestures";

/** Arrow keys move this far – with ⇧ further (a share of the face). */
export const NUDGE = { small: 0.005, big: 0.05 };
/** A copy lands this far off its original. */
const OFFSET = 0.03;

/** What is picked: the lines and areas, their frame – in this drawing. */
export type Picked = { items: Selection; frame: Frame; art: Art };

/** Where on the face a pointer is, and how many px a face unit is. */
export type Locate = (event: {
  clientX: number;
  clientY: number;
}) => { x: number; y: number; unit: number } | null;

/**
 * The selection tool (V), the way Figma does it: a click picks a thing
 * (what touches is one), ⇧-click adds or takes away, a box dragged over
 * empty space picks all it touches, a click into nothing lets go. Dragging
 * moves (⇧ straight, Alt a copy); the frame's handles size it (⇧ in
 * proportion, Alt about its middle), just outside a corner turns it (⇧ in
 * 15° steps) – on touch a knob above the frame, or two fingers. Every
 * gesture is one step back. The drawing shows each change at once (`live`)
 * and becomes one step when the pointer lets go (`settle`); keys and buttons
 * make theirs at once (`put`). A double click on a line with anchors (the
 * line tool's) asks to edit its points (`onEdit`).
 */
export const useSelect = ({
  on,
  area,
  art,
  shape,
  locate,
  live,
  settle,
  put,
  onEdit,
}: {
  on: boolean;
  area: RefObject<HTMLElement | null>;
  art: Art;
  /** The stamp's shape – its rim's inner edge is a guide. */
  shape?: ShapeLike;
  locate: Locate;
  live: (next: Art) => void;
  settle: (before: Art) => void;
  put: (next: Art) => void;
  onEdit?: (stroke: number) => void;
}) => {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [hover, setHover] = useState<Selection | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  // The guides what is dragged lies on – shown only while it is.
  const [lines, setLines] = useState<Guides | null>(null);
  // Fingers show the knob – no hover to find the turn by.
  const [touchy, setTouchy] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const fingers = useRef(new Map<number, Point>());
  const clip = useRef<{ art: Art; times: number } | null>(null);
  const pressed = useRef({ time: 0, x: 0, y: 0 });
  // The latest drawing and selection – ahead of the render during a drag.
  const latest = useRef({ art, picked });
  latest.current = { art, picked };
  // A selection belongs to its drawing: undone, it is gone.
  const chosen = on && picked && picked.art === art ? picked : null;

  useEffect(() => {
    setTouchy(matchMedia("(pointer: coarse)").matches);
  }, []);

  // Leaving the tool: nothing picked, the stage's own cursor back.
  useEffect(() => {
    if (on) return;
    setPicked(null);
    setHover(null);
    setMarquee(null);
    gesture.current = null;
    if (area.current) area.current.style.cursor = "";
  }, [on, area]);

  const choose = (next: Picked | null) => {
    latest.current.picked = next;
    setPicked(next);
  };

  const chooseIn = (into: Art, items: Selection | null) => {
    const frame = items && !isNothing(items) && frameFor(into, items);
    choose(items && frame ? { items, frame, art: into } : null);
  };

  /** A change shown – the selection carried along. */
  const show = (next: Art, items: Selection, frame: Frame) => {
    latest.current.art = next;
    live(next);
    choose({ items, frame, art: next });
  };

  const { down, move, up } = selectGestures({
    shape,
    locate,
    settle,
    onEdit,
    touchy,
    setTouchy,
    setHover,
    setMarquee,
    setLines,
    gesture,
    fingers,
    pressed,
    latest,
    choose,
    chooseIn,
    show,
  });

  const leave = () => setHover(null);

  /**
   * Whatever is under way stops – two fingers took over (they zoom): what
   * it changed so far stays, as one step.
   */
  const cancel = () => {
    const g = gesture.current;
    gesture.current = null;
    fingers.current.clear();
    setMarquee(null);
    setLines(null);
    if (g && g.kind !== "marquee" && g.changed) settle(g.before);
  };

  /** One step at once – the selection carried along. */
  const change = (next: Art, items: Selection | null) => {
    latest.current.art = next;
    put(next);
    chooseIn(next, items);
  };

  return {
    picked: chosen,
    hover: on ? hover : null,
    marquee: on ? marquee : null,
    lines: on ? lines : null,
    knob: touchy,
    down,
    move,
    up,
    leave,
    cancel,
    /** Two fingers turn and size what is picked – they don't zoom. */
    pinching: () => gesture.current?.kind === "pinch",
    clear: () => choose(null),
    all: () => chooseIn(art, everything(art)),
    /** These lines and areas picked – as they are, not what touches them. */
    pick: (items: Selection) => chooseIn(art, items),
    remove: () => {
      if (chosen) change(remove(art, chosen.items), null);
    },
    nudge: (dx: number, dy: number) => {
      if (!chosen) return;
      const [mx, my] = moveWithin(pointsOf(art, chosen.items), dx, dy);
      if (!(mx || my)) return;
      const m = translate(mx, my);
      const next = transformArt(art, chosen.items, m);
      latest.current.art = next;
      put(next);
      choose({
        items: chosen.items,
        frame: frameAfter(chosen.frame, m),
        art: next,
      });
    },
    /** The width the picked lines share – null: mixed, or no lines. */
    width: chosen && widthOf(art, chosen.items),
    /** The picked lines drawn this wide – one step. */
    restroke: (w: number) => {
      if (!chosen) return;
      const next = restroke(art, chosen.items, w);
      if (next.strokes.every((s, i) => s === art.strokes[i])) return;
      latest.current.art = next;
      put(next);
      // An upright frame hugs the new widths; a turned one stays as it is.
      const frame = chosen.frame.angle
        ? chosen.frame
        : frameFor(next, chosen.items);
      choose(frame ? { items: chosen.items, frame, art: next } : null);
    },
    duplicate: () => {
      if (!chosen) return;
      const added = addCopies(art, pick(art, chosen.items), OFFSET, OFFSET);
      if (added) change(added.art, added.selection);
    },
    copy: () => {
      if (chosen) clip.current = { art: pick(art, chosen.items), times: 0 };
    },
    cut: () => {
      if (!chosen) return;
      clip.current = { art: pick(art, chosen.items), times: 0 };
      change(remove(art, chosen.items), null);
    },
    /** Whether there is something to paste – then it is pasted. */
    paste: () => {
      const held = clip.current;
      if (!held) return false;
      held.times += 1;
      const shift = OFFSET * held.times;
      const added = addCopies(art, held.art, shift, shift);
      if (added) change(added.art, added.selection);
      return true;
    },
  };
};
