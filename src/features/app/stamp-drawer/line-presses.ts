import type { PointerEvent, RefObject } from "react";
import { itemAt } from "@/features/calendar/arrange";
import type { Art } from "@/features/calendar/art";
import {
  ANCHOR,
  anchorCount,
  insertAnchor,
  lineStroke,
  moveAnchor,
  moveHandle,
  pathGrip,
  pullHandles,
  snap45,
  toggleSmooth,
} from "@/features/calendar/bezier";
import {
  anchorGuides,
  type Guides,
  snapPoint,
} from "@/features/calendar/guides";
import type { ShapeLike } from "@/features/calendar/shapes";
import type { Locate } from "../use-select";

/**
 * What a press does with the line tool and in editing a line's points
 * (use-line.ts): where a new point goes, what is grabbed, how a drag bends
 * the line or moves what it holds – and what the pointer says it would do.
 */

/**
 * How near (px on screen, however far zoomed in) a pointer must come to an
 * anchor or a handle – a finger much more: a target 48 px across.
 */
const REACH = { mouse: 8, touch: 24 };
/** How near (px) a guide pulls. */
const SNAP = 5;
/** How far (px) a press may wander and still be a click. */
const SLOP = { mouse: 3, touch: 6 };

/** A press under way: what it is on, and the drawing it changes. */
export type Press = {
  kind: "lone" | "new" | "close" | "anchor" | "in" | "out";
  stroke: number;
  anchor: number;
  /** The drawing the change is made to. */
  art: Art;
  /** What one step back returns to – null: the press made its step already. */
  before: Art | null;
  origin: readonly [number, number];
  /**
   * How far what is grabbed lies from where the press began – kept as it is
   * dragged: a finger a little beside a point doesn't make it jump.
   */
  off: readonly [number, number];
  unit: number;
  touch: boolean;
  moved: boolean;
  changed: boolean;
};

/** Where the pointer is while drawing – the next point, or the first again. */
export type Hover = { x: number; y: number; closing: boolean };

const inSquare = (n: number) => Math.min(Math.max(n, 0), 1);

/** The drawing with one of its lines replaced. */
export const replaced = (
  art: Art,
  index: number,
  stroke: Art["strokes"][number]
) => ({
  ...art,
  strokes: art.strokes.map((s, i) => (i === index ? stroke : s)),
});

/** An anchor made a corner while editing – by its line and place. */
export const freeKey = (stroke: number, i: number) => `${stroke}:${i}`;

/** The line tool's state as it is this render (use-line.ts). */
type LineState = {
  mode: "line" | "points" | null;
  art: Art;
  shape?: ShapeLike;
  width: number;
  locate: Locate;
  live: (next: Art) => void;
  put: (next: Art) => void;
  onLeave: (stroke: number | null) => void;
  /** Drawing: the first anchor before there is a line, then the line's place. */
  lone: number[] | null;
  setLone: (lone: number[] | null) => void;
  setDrawn: (drawn: number | null) => void;
  drawing: number | null;
  /** Editing: the line, and the anchor picked on it. */
  editing: number | null;
  setEdited: (edited: number | null) => void;
  anchor: number | null;
  setAnchor: (anchor: number | null) => void;
  setHover: (hover: Hover | null) => void;
  setLines: (lines: Guides | null) => void;
  /** Round or corner: the anchors still to set, and those made corners. */
  corner: boolean;
  free: ReadonlySet<string>;
  press: RefObject<Press | null>;
};

export const linePresses = ({
  mode,
  art,
  shape,
  width,
  locate,
  live,
  put,
  onLeave,
  lone,
  setLone,
  setDrawn,
  drawing,
  editing,
  setEdited,
  anchor,
  setAnchor,
  setHover,
  setLines,
  corner,
  free,
  press,
}: LineState) => {
  /** The anchors of the line being drawn – its one, before it is a line. */
  const draft = () =>
    drawing !== null ? (art.strokes[drawing].a ?? []) : (lone ?? []);

  /** Where a new or dragged anchor goes: on the face, onto a guide near it. */
  const snapped = (
    x: number,
    y: number,
    event: PointerEvent,
    unit: number,
    guides: () => Guides
  ) => {
    if (event.metaKey || event.ctrlKey) {
      setLines(null);
      return [inSquare(x), inSquare(y)] as const;
    }
    const at = snapPoint(inSquare(x), inSquare(y), guides(), SNAP / unit);
    setLines(at.lines.x.length || at.lines.y.length ? at.lines : null);
    return [at.x, at.y] as const;
  };

  /** Where a new point goes: ⇧ in 45° steps from the last anchor, else snapped. */
  const linePoint = (
    event: PointerEvent,
    x: number,
    y: number,
    unit: number
  ) => {
    const anchors = draft();
    const n = anchorCount(anchors);
    if (event.shiftKey && n) {
      const k = (n - 1) * ANCHOR;
      const [sx, sy] = snap45(anchors[k], anchors[k + 1], x, y);
      setLines(null);
      return [inSquare(sx), inSquare(sy)] as const;
    }
    return snapped(x, y, event, unit, () =>
      anchorGuides(art, lone ?? [], undefined, shape)
    );
  };

  /** Whether a point is on the first anchor of a line that can close. */
  const onFirst = (x: number, y: number, reach: number) => {
    const anchors = draft();
    return (
      drawing !== null &&
      anchorCount(anchors) >= 2 &&
      Math.hypot(anchors[0] - x, anchors[1] - y) <= reach
    );
  };

  const begin = (
    event: PointerEvent<HTMLElement>,
    at: { x: number; y: number; unit: number },
    rest: Pick<Press, "kind" | "stroke" | "anchor" | "art" | "before">,
    grabbed?: readonly [number, number]
  ) => {
    press.current = {
      ...rest,
      origin: [at.x, at.y],
      off: grabbed ? [grabbed[0] - at.x, grabbed[1] - at.y] : [0, 0],
      unit: at.unit,
      touch: event.pointerType !== "mouse",
      moved: false,
      changed: false,
    };
  };

  const downLine = (
    event: PointerEvent<HTMLElement>,
    at: { x: number; y: number; unit: number },
    reach: number
  ) => {
    setHover(null);
    setAnchor(null);
    if (drawing !== null && onFirst(at.x, at.y, reach)) {
      // Onto the first point: the line closes – dragged on, it bends in.
      const stroke = art.strokes[drawing];
      const next = replaced(
        art,
        drawing,
        lineStroke(stroke.w, stroke.a ?? [], true)
      );
      put(next);
      setLines(null);
      begin(event, at, {
        kind: "close",
        stroke: drawing,
        anchor: 0,
        art: next,
        before: null,
      });
      return;
    }
    // Onto one of its points: picked – dragged, it moves (no new point on
    // top of it).
    const grabbed =
      drawing !== null &&
      pathGrip(art.strokes[drawing].a ?? [], false, at.x, at.y, reach);
    if (drawing !== null && grabbed && grabbed.kind === "anchor") {
      const a = art.strokes[drawing].a ?? [];
      const k = grabbed.i * ANCHOR;
      setAnchor(grabbed.i);
      begin(
        event,
        at,
        {
          kind: "anchor",
          stroke: drawing,
          anchor: grabbed.i,
          art,
          before: art,
        },
        [a[k], a[k + 1]]
      );
      return;
    }
    const [x, y] = linePoint(event, at.x, at.y, at.unit);
    const added = [x, y, x, y, x, y];
    if (drawing !== null) {
      const stroke = art.strokes[drawing];
      const a = [...(stroke.a ?? []), ...added];
      const next = replaced(art, drawing, lineStroke(stroke.w, a));
      put(next);
      begin(event, at, {
        kind: "new",
        stroke: drawing,
        anchor: anchorCount(a) - 1,
        art: next,
        before: null,
      });
    } else if (lone) {
      // The second point: now it is a line, and in the drawing.
      const index = art.strokes.length;
      const next = {
        ...art,
        strokes: [...art.strokes, lineStroke(width, [...lone, ...added])],
      };
      put(next);
      setLone(null);
      setDrawn(index);
      begin(event, at, {
        kind: "new",
        stroke: index,
        anchor: 1,
        art: next,
        before: null,
      });
    } else {
      setLone(added);
      setDrawn(null);
      begin(event, at, {
        kind: "lone",
        stroke: -1,
        anchor: 0,
        art,
        before: null,
      });
    }
  };

  const downPoints = (
    event: PointerEvent<HTMLElement>,
    at: { x: number; y: number; unit: number },
    reach: number
  ) => {
    if (editing !== null) {
      const stroke = art.strokes[editing];
      const a = stroke.a ?? [];
      const closed = Boolean(stroke.closed);
      const hit = pathGrip(a, closed, at.x, at.y, reach);
      if (hit?.kind === "anchor" && event.altKey) {
        setAnchor(hit.i);
        put(
          replaced(
            art,
            editing,
            lineStroke(stroke.w, toggleSmooth(a, closed, hit.i), closed)
          )
        );
        return;
      }
      if (hit?.kind === "line") {
        // A new point where the line is – dragged on, it moves (one step).
        const added = insertAnchor(a, hit.curve, hit.t);
        const next = replaced(
          art,
          editing,
          lineStroke(stroke.w, added.a, closed)
        );
        put(next);
        setAnchor(added.index);
        begin(event, at, {
          kind: "anchor",
          stroke: editing,
          anchor: added.index,
          art: next,
          before: null,
        });
        return;
      }
      if (hit) {
        const k = hit.i * ANCHOR + { anchor: 0, in: 2, out: 4 }[hit.kind];
        setAnchor(hit.i);
        begin(
          event,
          at,
          {
            kind: hit.kind,
            stroke: editing,
            anchor: hit.i,
            art,
            before: art,
          },
          [a[k], a[k + 1]]
        );
        return;
      }
    }
    // Beside it: another anchored line is edited – or editing is over. A
    // finger that missed lets go of the picked point first: one more tap
    // beside it is needed to leave.
    const index = itemAt(art, at.x, at.y, reach)?.strokes[0];
    if (index !== undefined && art.strokes[index]?.a) {
      setEdited(index);
      setAnchor(null);
    } else if (event.pointerType === "touch" && anchor !== null) {
      setAnchor(null);
    } else onLeave(null);
  };

  const down = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (press.current) return;
    const at = locate(event);
    if (!at) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer knows – it goes on all the same.
    }
    const touch = event.pointerType !== "mouse";
    const reach = (touch ? REACH.touch : REACH.mouse) / at.unit;
    if (mode === "line") downLine(event, at, reach);
    else if (mode === "points") downPoints(event, at, reach);
  };

  const hovering = (
    event: PointerEvent<HTMLElement>,
    at: { x: number; y: number; unit: number }
  ) => {
    if (event.pointerType !== "mouse") return;
    const reach = REACH.mouse / at.unit;
    if (mode === "line") {
      event.currentTarget.style.cursor = "crosshair";
      if (onFirst(at.x, at.y, reach)) {
        const anchors = draft();
        setLines(null);
        setHover({ x: anchors[0], y: anchors[1], closing: true });
      } else if (
        drawing !== null &&
        pathGrip(art.strokes[drawing].a ?? [], false, at.x, at.y, reach)
          ?.kind === "anchor"
      ) {
        // On one of its points: a press picks it, no new one.
        setLines(null);
        setHover(null);
        event.currentTarget.style.cursor = "move";
      } else {
        const [x, y] = linePoint(event, at.x, at.y, at.unit);
        setHover({ x, y, closing: false });
      }
      return;
    }
    // Editing: the pointer says what a press would do.
    let cursor = "default";
    const stroke = editing !== null ? art.strokes[editing] : null;
    const hit =
      stroke &&
      pathGrip(stroke.a ?? [], Boolean(stroke.closed), at.x, at.y, reach);
    if (hit) cursor = hit.kind === "line" ? "copy" : "move";
    else {
      const index = itemAt(art, at.x, at.y, reach)?.strokes[0];
      if (index !== undefined && art.strokes[index]?.a) cursor = "pointer";
    }
    event.currentTarget.style.cursor = cursor;
  };

  const move = (event: PointerEvent<HTMLElement>) => {
    const at = locate(event);
    if (!at) return;
    const p = press.current;
    if (!p) {
      hovering(event, at);
      return;
    }
    if (!p.moved) {
      const slop = (p.touch ? SLOP.touch : SLOP.mouse) / p.unit;
      if (Math.hypot(at.x - p.origin[0], at.y - p.origin[1]) < slop) return;
      p.moved = true;
    }
    if (p.kind === "lone") {
      if (!lone) return;
      const [x, y] = event.shiftKey
        ? snap45(lone[0], lone[1], at.x, at.y)
        : [at.x, at.y];
      // Handles may reach beyond the face (bezier.ts) – followed out there.
      setLone(pullHandles(lone, 0, x, y, event.altKey || corner));
      return;
    }
    const stroke = p.art.strokes[p.stroke];
    const a = stroke?.a;
    if (!a) return;
    const k = p.anchor * ANCHOR;
    const closed = Boolean(stroke.closed);
    let next: number[];
    // Where what is grabbed goes – as far beside the pointer as it began.
    const gx = at.x + p.off[0];
    const gy = at.y + p.off[1];
    if (p.kind === "anchor") {
      const [x, y] = snapped(gx, gy, event, p.unit, () =>
        anchorGuides(p.art, [], { stroke: p.stroke, anchor: p.anchor }, shape)
      );
      next = moveAnchor(a, p.anchor, x, y);
    } else {
      // A handle: ⇧ in 45° steps about its anchor – followed beyond the
      // face, where it may reach (bezier.ts).
      const [x, y] = event.shiftKey ? snap45(a[k], a[k + 1], gx, gy) : [gx, gy];
      if (p.kind === "new") {
        next = pullHandles(a, p.anchor, x, y, event.altKey || corner);
      } else if (p.kind === "close") {
        // Only the handle in – the first curve stays as it was drawn.
        next = moveHandle(a, 0, "in", 2 * a[0] - x, 2 * a[1] - y, true);
      } else {
        next = moveHandle(
          a,
          p.anchor,
          p.kind,
          x,
          y,
          event.altKey || free.has(freeKey(p.stroke, p.anchor))
        );
      }
    }
    p.changed = true;
    live(replaced(p.art, p.stroke, lineStroke(stroke.w, next, closed)));
  };

  return { draft, down, move };
};
