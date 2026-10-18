import type { PointerEvent, RefObject } from "react";
import {
  addCopies,
  boxOf,
  type Frame,
  frameAfter,
  frameAround,
  grip,
  isNothing,
  itemAt,
  join,
  type Matrix,
  moveWithin,
  pick,
  pinching,
  pointsOf,
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
} from "@/features/calendar/arrange";
import type { Art, Box, Point } from "@/features/calendar/art";
import {
  type Guides,
  guidesFor,
  linesAt,
  snapMove,
  snapPoint,
} from "@/features/calendar/guides";
import type { ShapeLike } from "@/features/calendar/shapes";
import type { Locate, Picked } from "../use-select";

/**
 * What the pointer does with the selection tool (use-select.ts): a press
 * picks, or grabs what is picked by its frame, a handle or the turn; a drag
 * moves, sizes, turns – two fingers both – or draws a box to pick with; the
 * pointer says what a press would do.
 */

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
/**
 * Two presses this soon (ms) and near (px) are a double click – a finger's
 * two taps land further apart.
 */
const TWICE = { ms: 400, px: { mouse: 8, touch: 24 } };

/** The turning cursor: an arrow round a corner, inked on a white edge. */
const TURN_CURSOR = (() => {
  const arc = "M7 15.5A7 7 0 1 0 9 8.5";
  const head = "M5.5 5.5 9 8.5l-3.5 3";
  const line = (color: string, width: number) =>
    `<path d='${arc}${head}' fill='none' stroke='${color}' stroke-width='${width}' stroke-linecap='round' stroke-linejoin='round'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>${line("white", 4.5)}${line("#141414", 2)}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, alias`;
})();

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

export type Gesture =
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

export const frameFor = (art: Art, items: Selection) => {
  const box = boxOf(art, items);
  return box && frameAround(box);
};

/** Whether `a` holds all of `b`. */
const holds = (a: Selection, b: Selection) =>
  b.strokes.every((i) => a.strokes.includes(i)) &&
  b.fills.every((i) => a.fills.includes(i));

/** The selection tool's state as it is this render (use-select.ts). */
type SelectState = {
  shape?: ShapeLike;
  locate: Locate;
  settle: (before: Art) => void;
  onEdit?: (stroke: number) => void;
  /** Fingers show the knob – no hover to find the turn by. */
  touchy: boolean;
  setTouchy: (touchy: boolean) => void;
  setHover: (
    hover: Selection | null | ((was: Selection | null) => Selection | null)
  ) => void;
  setMarquee: (marquee: Box | null) => void;
  setLines: (lines: Guides | null) => void;
  gesture: RefObject<Gesture | null>;
  fingers: RefObject<Map<number, Point>>;
  pressed: RefObject<{ time: number; x: number; y: number }>;
  /** The latest drawing and selection – ahead of the render during a drag. */
  latest: RefObject<{ art: Art; picked: Picked | null }>;
  choose: (next: Picked | null) => void;
  chooseIn: (into: Art, items: Selection | null) => void;
  /** A change shown – the selection carried along. */
  show: (next: Art, items: Selection, frame: Frame) => void;
  /** A copy just laid down, while it is picked (use-select.ts). */
  loose: RefObject<Selection | null>;
};

export const selectGestures = ({
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
  loose,
}: SelectState) => {
  /** Whether what is picked is a loose copy – moved alone, whatever it touches. */
  const isLoose = (items: Selection) =>
    !!loose.current && sameSelection(loose.current, items);

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
      // In a loose copy's frame, only it is grabbed.
      if (
        over &&
        current &&
        (holds(current.items, over) ||
          (hit?.kind === "move" && isLoose(current.items)))
      ) {
        over = null;
      }
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
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer knows – it goes on all the same.
    }
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
    // Twice on a line with anchors: its points are edited.
    const before = pressed.current;
    const twice =
      event.timeStamp - before.time < TWICE.ms &&
      Math.hypot(at.x - before.x, at.y - before.y) * at.unit <
        (touch ? TWICE.px.touch : TWICE.px.mouse);
    pressed.current = { time: event.timeStamp, x: at.x, y: at.y };
    const line = twice
      ? itemAt(now.art, at.x, at.y, reach)?.strokes[0]
      : undefined;
    if (onEdit && line !== undefined && now.art.strokes[line]?.a) {
      fingers.current.delete(event.pointerId);
      onEdit(line);
      return;
    }
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
      // which is picked instead (⇧: added or taken away); a loose copy
      // moves whatever it lies on.
      if (
        hit?.kind === "move" &&
        !event.shiftKey &&
        (!thing || holds(current.items, thing) || isLoose(current.items))
      ) {
        gesture.current = { ...base, kind: "move", copy: event.altKey };
        return;
      }
    }
    // Anything else picked: a loose copy is placed.
    loose.current = null;
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
          loose.current = copies.selection;
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
        g.guides ??= guidesFor(g.start, g.items, shape);
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
        g.guides ??= guidesFor(g.start, g.items, shape);
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

  return { down, move, up };
};
