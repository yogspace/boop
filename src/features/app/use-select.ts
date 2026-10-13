import {
  type PointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  addCopies,
  boxOf,
  everything,
  type Frame,
  frameAfter,
  frameAround,
  grip,
  isNothing,
  join,
  type Matrix,
  moveWithin,
  pick,
  pinching,
  pointsOf,
  remove,
  restroke,
  type Selection,
  sameSelection,
  sizeCursor,
  sizing,
  thingAt,
  toggle,
  touching,
  transformArt,
  translate,
  turning,
  widthOf,
} from "@/features/calendar/arrange";
import type { Art, Box, Point } from "@/features/calendar/art";
import {
  type Guides,
  guidesFor,
  linesAt,
  snapMove,
  snapPoint,
} from "@/features/calendar/guides";

/** How near (px) a pointer must come to a thing or a handle – a finger more. */
const REACH = { mouse: 7, touch: 18 };
/** How far (px) outside a corner the pointer turns the selection. */
const TURN = 22;
/** How far (px) above the frame the knob for turning stands – on touch. */
export const KNOB = 30;
/** How near (px) a guide pulls – whatever the stage's size. */
const SNAP = 5;
/** How far (px) a press may wander and still be a click. */
const SLOP = { mouse: 3, touch: 6 };
/** Arrow keys move this far – with ⇧ further (a share of the face). */
export const NUDGE = { small: 0.005, big: 0.05 };
/** A copy lands this far off its original. */
const OFFSET = 0.03;

/** The turning cursor: an arrow round a corner, inked on a white edge. */
const TURN_CURSOR = (() => {
  const arc = "M7 15.5A7 7 0 1 0 9 8.5";
  const head = "M5.5 5.5 9 8.5l-3.5 3";
  const line = (color: string, width: number) =>
    `<path d='${arc}${head}' fill='none' stroke='${color}' stroke-width='${width}' stroke-linecap='round' stroke-linejoin='round'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>${line("white", 4.5)}${line("#141414", 2)}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, alias`;
})();

/** What is picked: the lines and areas, their frame – in this drawing. */
export type Picked = { items: Selection; frame: Frame; art: Art };

/** Where on the face a pointer is, and how many px a face unit is. */
export type Locate = (event: {
  clientX: number;
  clientY: number;
}) => { x: number; y: number; unit: number } | null;

type Press = {
  pointer: number;
  origin: Point;
  /** Px per face unit when it began. */
  unit: number;
  touch: boolean;
  /** The drawing before – what one step back returns to. */
  before: Art;
  /** What the change is made to, and what it moves. */
  start: Art;
  items: Selection;
  frame: Frame;
  points: number[];
  /** The lines it may snap to – found when it first moves. */
  guides: Guides | null;
  /** Past the slop – a drag, not a click. */
  moved: boolean;
  changed: boolean;
};

type Gesture =
  | (Press & { kind: "move"; copy: boolean })
  | (Press & { kind: "size"; handle: Point })
  | (Press & { kind: "turn" })
  | (Press & { kind: "pinch"; fingers: [Point, Point] })
  | {
      kind: "marquee";
      pointer: number;
      origin: Point;
      unit: number;
      touch: boolean;
      base: Selection | null;
      box: Box | null;
    };

const between = (a: Point, b: Point): Box => ({
  x0: Math.min(a[0], b[0]),
  y0: Math.min(a[1], b[1]),
  x1: Math.max(a[0], b[0]),
  y1: Math.max(a[1], b[1]),
});

const frameFor = (art: Art, items: Selection) => {
  const box = boxOf(art, items);
  return box && frameAround(box);
};

/** Whether `a` holds all of `b`. */
const holds = (a: Selection, b: Selection) =>
  b.strokes.every((i) => a.strokes.includes(i)) &&
  b.fills.every((i) => a.fills.includes(i));

/**
 * The selection tool (V), the way Figma does it: a click picks a thing
 * (what touches is one), ⇧-click adds or takes away, a box dragged over
 * empty space picks all it touches, a click into nothing lets go. Dragging
 * moves (⇧ straight, Alt a copy); the frame's handles size it (⇧ in
 * proportion, Alt about its middle), just outside a corner turns it (⇧ in
 * 15° steps) – on touch a knob above the frame, or two fingers. Every
 * gesture is one step back. The drawing shows each change at once (`live`)
 * and becomes one step when the pointer lets go (`settle`); keys and buttons
 * make theirs at once (`put`).
 */
export const useSelect = ({
  on,
  area,
  art,
  locate,
  live,
  settle,
  put,
}: {
  on: boolean;
  area: RefObject<HTMLElement | null>;
  art: Art;
  locate: Locate;
  live: (next: Art) => void;
  settle: (before: Art) => void;
  put: (next: Art) => void;
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

  const hovering = (
    event: PointerEvent<HTMLElement>,
    point: Point,
    unit: number
  ) => {
    if (event.pointerType !== "mouse") return;
    const reach = REACH.mouse / unit;
    const now = latest.current;
    const current = now.picked?.art === now.art ? now.picked : null;
    let cursor = "default";
    let over: Selection | null = null;
    const hit =
      current &&
      grip(current.frame, point[0], point[1], {
        reach,
        turn: TURN / unit,
        knob: touchy ? KNOB / unit : 0,
      });
    if (hit?.kind === "size" && current) {
      cursor = sizeCursor(current.frame, hit.handle);
    } else if (hit?.kind === "turn") cursor = TURN_CURSOR;
    else {
      over = thingAt(now.art, point[0], point[1], reach);
      if (over || hit?.kind === "move") cursor = "move";
      if (over && current && holds(current.items, over)) over = null;
    }
    event.currentTarget.style.cursor = cursor;
    setHover((was) => (was && over && sameSelection(was, over) ? was : over));
  };

  const down = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = locate(event);
    if (!at) return;
    const point: Point = [at.x, at.y];
    const touch = event.pointerType !== "mouse";
    setTouchy(touch);
    event.currentTarget.setPointerCapture(event.pointerId);
    fingers.current.set(event.pointerId, point);
    const now = latest.current;
    const current = now.picked?.art === now.art ? now.picked : null;
    const going = gesture.current;

    // A second finger: the two turn and size what is picked.
    if (going && fingers.current.size === 2) {
      if (going.kind === "marquee") {
        gesture.current = null;
        setMarquee(null);
        setHover(null);
        return;
      }
      if (!current) return;
      const [a, b] = [...fingers.current.values()];
      gesture.current = {
        ...going,
        kind: "pinch",
        start: now.art,
        frame: current.frame,
        points: pointsOf(now.art, going.items),
        guides: null,
        fingers: [a, b],
        moved: true,
      };
      return;
    }
    if (fingers.current.size > 1) return;
    setHover(null);
    const reach = (touch ? REACH.touch : REACH.mouse) / at.unit;
    const press = (items: Selection, frame: Frame): Press => ({
      pointer: event.pointerId,
      origin: point,
      unit: at.unit,
      touch,
      before: now.art,
      start: now.art,
      items,
      frame,
      points: pointsOf(now.art, items),
      guides: null,
      moved: false,
      changed: false,
    });

    const thing = thingAt(now.art, point[0], point[1], reach);
    if (current) {
      const hit = grip(current.frame, point[0], point[1], {
        reach,
        turn: touch ? 0 : TURN / at.unit,
        knob: touchy || touch ? KNOB / at.unit : 0,
      });
      const base = press(current.items, current.frame);
      if (hit?.kind === "size") {
        gesture.current = { ...base, kind: "size", handle: hit.handle };
        return;
      }
      if (hit?.kind === "turn") {
        gesture.current = { ...base, kind: "turn" };
        return;
      }
      // Inside the frame it moves – unless the press is on another thing,
      // which is picked instead (⇧: added or taken away).
      if (
        hit?.kind === "move" &&
        !event.shiftKey &&
        (!thing || holds(current.items, thing))
      ) {
        gesture.current = { ...base, kind: "move", copy: event.altKey };
        return;
      }
    }
    if (thing) {
      const items =
        event.shiftKey && current ? toggle(current.items, thing) : thing;
      const frame = !isNothing(items) && frameFor(now.art, items);
      if (!frame) {
        choose(null);
        return;
      }
      choose({ items, frame, art: now.art });
      // Pressed on what is picked now: dragged, it moves.
      if (holds(items, thing)) {
        gesture.current = {
          ...press(items, frame),
          kind: "move",
          copy: event.altKey,
        };
      }
      return;
    }
    // Nothing there: a box to pick with – ⇧ adds what it catches.
    if (!event.shiftKey) choose(null);
    gesture.current = {
      kind: "marquee",
      pointer: event.pointerId,
      origin: point,
      unit: at.unit,
      touch,
      base: event.shiftKey && current ? current.items : null,
      box: null,
    };
  };

  const move = (event: PointerEvent<HTMLElement>) => {
    const at = locate(event);
    if (!at) return;
    const point: Point = [at.x, at.y];
    if (fingers.current.has(event.pointerId)) {
      fingers.current.set(event.pointerId, point);
    }
    const g = gesture.current;
    if (!g) {
      hovering(event, point, at.unit);
      return;
    }
    if (g.kind !== "pinch" && g.pointer !== event.pointerId) return;
    const slop = (g.touch ? SLOP.touch : SLOP.mouse) / g.unit;
    if (g.kind === "marquee") {
      if (
        !g.box &&
        Math.hypot(point[0] - g.origin[0], point[1] - g.origin[1]) < slop
      ) {
        return;
      }
      g.box = between(g.origin, point);
      setMarquee(g.box);
      setHover(touching(latest.current.art, g.box));
      return;
    }
    if (!g.moved) {
      if (Math.hypot(point[0] - g.origin[0], point[1] - g.origin[1]) < slop) {
        return;
      }
      g.moved = true;
      if (g.kind === "move" && g.copy) {
        // Alt-drag: the copies move, the originals stay.
        const copies = addCopies(g.start, pick(g.start, g.items), 0, 0);
        if (copies) {
          g.start = copies.art;
          g.items = copies.selection;
          g.points = pointsOf(copies.art, copies.selection);
          g.guides = null;
        }
      }
    }
    let m: Matrix;
    // Guides pull unless ⌘ / Ctrl is held, as in Figma.
    const snapping = !(event.metaKey || event.ctrlKey);
    const reach = SNAP / g.unit;
    let along: Guides | null = null;
    if (g.kind === "move") {
      let dx = point[0] - g.origin[0];
      let dy = point[1] - g.origin[1];
      const free = { x: true, y: true };
      if (event.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) {
          dy = 0;
          free.y = false;
        } else {
          dx = 0;
          free.x = false;
        }
      }
      const box = boxOf(g.start, g.items);
      if (snapping && box) {
        g.guides ??= guidesFor(g.start, g.items);
        [dx, dy] = snapMove(box, dx, dy, g.guides, reach, free);
      }
      [dx, dy] = moveWithin(g.points, dx, dy);
      m = translate(dx, dy);
      if (snapping && box && g.guides) {
        along = linesAt(
          {
            x0: box.x0 + dx,
            y0: box.y0 + dy,
            x1: box.x1 + dx,
            y1: box.y1 + dy,
          },
          g.guides
        );
      }
      event.currentTarget.style.cursor = "move";
    } else if (g.kind === "size") {
      const [hx, hy] = g.handle;
      let to = point;
      // An upright frame's dragged side snaps, too.
      const upright = Math.abs(Math.sin(g.frame.angle)) < 1e-9;
      if (snapping && upright) {
        g.guides ??= guidesFor(g.start, g.items);
        const x = g.frame.cx + (hx * g.frame.w) / 2 + point[0] - g.origin[0];
        const y = g.frame.cy + (hy * g.frame.h) / 2 + point[1] - g.origin[1];
        const snapped = snapPoint(x, y, g.guides, reach, {
          x: hx !== 0,
          y: hy !== 0,
        });
        to = [point[0] + snapped.x - x, point[1] + snapped.y - y];
      }
      m = sizing(g.frame, g.points, g.handle, g.origin, to, {
        even: event.shiftKey,
        centered: event.altKey,
      });
      if (snapping && upright && g.guides) {
        const f = frameAfter(g.frame, m);
        const box = {
          x0: f.cx - f.w / 2,
          y0: f.cy - f.h / 2,
          x1: f.cx + f.w / 2,
          y1: f.cy + f.h / 2,
        };
        const all = linesAt(box, g.guides);
        // Only the sides being dragged.
        const side = (v: number, low: number, high: number, h: number) =>
          (h < 0 && Math.abs(v - low) < 1e-6) ||
          (h > 0 && Math.abs(v - high) < 1e-6);
        along = {
          x: all.x.filter((v) => side(v, box.x0, box.x1, hx)),
          y: all.y.filter((v) => side(v, box.y0, box.y1, hy)),
        };
      }
    } else if (g.kind === "turn") {
      m = turning(g.frame, g.points, g.origin, point, event.shiftKey);
    } else {
      const [a, b] = [...fingers.current.values()];
      if (!(a && b)) return;
      m = pinching(g.frame, g.points, g.fingers, [a, b]);
    }
    g.changed = true;
    setLines(along && (along.x.length || along.y.length) ? along : null);
    show(transformArt(g.start, g.items, m), g.items, frameAfter(g.frame, m));
  };

  const up = (event: PointerEvent<HTMLElement>) => {
    fingers.current.delete(event.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      const [rest] = [...fingers.current.entries()];
      if (rest && fingers.current.size === 1) {
        // One finger stays on: it moves on from here.
        const now = latest.current;
        const frame = now.picked?.frame ?? g.frame;
        gesture.current = {
          ...g,
          kind: "move",
          copy: false,
          pointer: rest[0],
          origin: rest[1],
          start: now.art,
          frame,
          points: pointsOf(now.art, g.items),
          guides: null,
          moved: true,
        };
        return;
      }
      if (fingers.current.size) return;
    } else if (g.pointer !== event.pointerId) return;
    gesture.current = null;
    setLines(null);
    if (g.kind === "marquee") {
      setMarquee(null);
      setHover(null);
      if (!g.box) return;
      const now = latest.current.art;
      const caught = touching(now, g.box);
      chooseIn(
        now,
        g.base && caught ? join(g.base, caught) : (caught ?? g.base)
      );
      return;
    }
    if (g.changed) settle(g.before);
  };

  const leave = () => setHover(null);

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
    clear: () => choose(null),
    all: () => chooseIn(art, everything(art)),
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
