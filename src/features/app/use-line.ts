import {
  type PointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { itemAt } from "@/features/calendar/arrange";
import type { Art } from "@/features/calendar/art";
import {
  ANCHOR,
  anchorCount,
  insertAnchor,
  isSmooth,
  lineStroke,
  moveAnchor,
  moveHandle,
  pathGrip,
  pullHandles,
  removeAnchor,
  smoothen,
  snap45,
  toggleSmooth,
} from "@/features/calendar/bezier";
import {
  anchorGuides,
  type Guides,
  snapPoint,
} from "@/features/calendar/guides";
import type { ShapeLike } from "@/features/calendar/shapes";
import type { Locate } from "./use-select";

/** How near (px) a pointer must come to an anchor or a handle – a finger more. */
const REACH = { mouse: 8, touch: 18 };
/** How near (px) a guide pulls. */
const SNAP = 5;
/** How far (px) a press may wander and still be a click. */
const SLOP = { mouse: 3, touch: 6 };

/** A press under way: what it is on, and the drawing it changes. */
type Press = {
  kind: "lone" | "new" | "close" | "anchor" | "in" | "out";
  stroke: number;
  anchor: number;
  /** The drawing the change is made to. */
  art: Art;
  /** What one step back returns to – null: the press made its step already. */
  before: Art | null;
  origin: readonly [number, number];
  unit: number;
  touch: boolean;
  moved: boolean;
  changed: boolean;
};

/** What the tool draws over the drawing (draw-tools.tsx `LineMarks`). */
export type LineMarking = {
  anchors: readonly number[];
  closed: boolean;
  /** The line as it is drawn – its flat points. */
  line: readonly number[];
  /** The anchor picked – its square filled. */
  picked: number | null;
  /** Whose handles show: every anchor's, or the last one's. */
  handles: "all" | "last";
  /** The next curve, to the pointer: a cubic's eight numbers. */
  preview: readonly number[] | null;
  /** The pointer is on the first anchor – a press closes the line. */
  closing: boolean;
};

const inSquare = (n: number) => Math.min(Math.max(n, 0), 1);

/** The drawing with one of its lines replaced. */
const replaced = (art: Art, index: number, stroke: Art["strokes"][number]) => ({
  ...art,
  strokes: art.strokes.map((s, i) => (i === index ? stroke : s)),
});

/**
 * The line tool (L) and editing its lines' points (A), the way Figma and
 * Illustrator do it – not the pen, which draws freehand.
 *
 * - **Drawing:** clicks set points, straight lines between them; a press
 *   dragged bends the line there into a curve – a smooth point, its
 *   handles pulled out, mirrored (Alt: only the one ahead – a corner with
 *   a curve; ⇧: in 45° steps). A press on the first point closes the line.
 *   Each point is a step back; ⌫ takes the last one away, Enter or Escape
 *   – or another tool – ends the line. Until its second point a line is
 *   not in the drawing yet (`lone`).
 * - **Editing:** anchors and handles are dragged (a smooth point's handles
 *   stay mirrored – not with Alt), Alt-click switches smooth and corner, a
 *   click on the line puts a point there, Delete takes the picked one away.
 *   A press beside the line edits another such line – or leaves
 *   (`onLeave`).
 * - **Round or corner** without Alt (a finger has none): `setKind` – for
 *   the anchors still to set while drawing, for the picked one while
 *   editing. A corner's handles move each on its own; made round, they
 *   line up again, mirrored.
 *
 * Handles go on beyond the face where they are dragged (bezier.ts – the
 * curve itself stays on it).
 *
 * New and dragged anchors snap to the stamp's middle and level with or
 * above other anchors (guides.ts), unless ⌘ / Ctrl is held. Such a line –
 * an anchored line – is an ordinary line with its anchors kept (bezier.ts
 * `lineStroke`).
 */
export const useLine = ({
  mode,
  area,
  art,
  shape,
  width,
  locate,
  live,
  settle,
  put,
  onLeave,
}: {
  mode: "line" | "points" | null;
  area: RefObject<HTMLElement | null>;
  art: Art;
  /** The stamp's shape – its rim's inner edge is a guide. */
  shape?: ShapeLike;
  /** The width a new line is drawn with. */
  width: number;
  locate: Locate;
  live: (next: Art) => void;
  settle: (before: Art) => void;
  put: (next: Art) => void;
  /** Editing is over – back to picking, with this line picked (or nothing). */
  onLeave: (stroke: number | null) => void;
}) => {
  // Drawing: the first anchor before there is a line, then the line's place.
  const [lone, setLone] = useState<number[] | null>(null);
  const [drawn, setDrawn] = useState<number | null>(null);
  // Editing: the line, and the anchor picked on it.
  const [edited, setEdited] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    closing: boolean;
  } | null>(null);
  const [lines, setLines] = useState<Guides | null>(null);
  const press = useRef<Press | null>(null);
  // Round or corner: the anchors still to set, and those made corners while
  // editing (by their line and place) – their handles move each on its own.
  const [corner, setCorner] = useState(false);
  const [free, setFree] = useState<ReadonlySet<string>>(new Set());
  const freeKey = (stroke: number, i: number) => `${stroke}:${i}`;

  // The line being drawn is the drawing's last, an anchored line still open – a
  // step back that takes it away ends it.
  const last = art.strokes.at(-1);
  const drawing =
    mode === "line" &&
    drawn !== null &&
    drawn === art.strokes.length - 1 &&
    last?.a &&
    !last.closed
      ? drawn
      : null;
  const editing =
    mode === "points" && edited !== null && art.strokes[edited]?.a
      ? edited
      : null;

  // Another tool: nothing under way, the stage's own cursor back.
  useEffect(() => {
    if (mode !== "line") {
      setLone(null);
      setDrawn(null);
      setHover(null);
    }
    if (mode !== "points") {
      setEdited(null);
      setAnchor(null);
    }
    setLines(null);
    press.current = null;
    if (area.current) {
      area.current.style.cursor = mode === "line" ? "crosshair" : "";
    }
  }, [mode, area]);

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
    rest: Pick<Press, "kind" | "stroke" | "anchor" | "art" | "before">
  ) => {
    press.current = {
      ...rest,
      origin: [at.x, at.y],
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
        setAnchor(hit.i);
        begin(event, at, {
          kind: hit.kind,
          stroke: editing,
          anchor: hit.i,
          art,
          before: art,
        });
        return;
      }
    }
    // Beside it: another anchored line is edited – or editing is over.
    const index = itemAt(art, at.x, at.y, reach)?.strokes[0];
    if (index !== undefined && art.strokes[index]?.a) {
      setEdited(index);
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
      if (onFirst(at.x, at.y, reach)) {
        const anchors = draft();
        setLines(null);
        setHover({ x: anchors[0], y: anchors[1], closing: true });
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
    if (p.kind === "anchor") {
      const [x, y] = snapped(at.x, at.y, event, p.unit, () =>
        anchorGuides(p.art, [], { stroke: p.stroke, anchor: p.anchor }, shape)
      );
      next = moveAnchor(a, p.anchor, x, y);
    } else {
      // A handle: ⇧ in 45° steps about its anchor – followed beyond the
      // face, where it may reach (bezier.ts).
      const [x, y] = event.shiftKey
        ? snap45(a[k], a[k + 1], at.x, at.y)
        : [at.x, at.y];
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

  /** The line being drawn is done – it stays as it is. */
  const finish = () => {
    setLone(null);
    setDrawn(null);
    setHover(null);
    setLines(null);
    press.current = null;
  };

  /** What is under way stops – two fingers took over; what it changed stays. */
  const cancel = () => {
    const p = press.current;
    press.current = null;
    setLines(null);
    if (p?.changed && p.before) settle(p.before);
  };

  const up = () => {
    const p = press.current;
    if (!p) return;
    press.current = null;
    setLines(null);
    if (p.changed && p.before) settle(p.before);
    if (p.kind === "close") finish();
  };

  const stroke = editing !== null ? art.strokes[editing] : null;
  const anchors = draft();
  const count = anchorCount(anchors);
  const from = (count - 1) * ANCHOR;
  let marks: LineMarking | null = null;
  if (mode === "line" && count) {
    marks = {
      anchors,
      closed: false,
      line: drawing !== null ? art.strokes[drawing].p : [],
      picked: null,
      handles: "last",
      preview: !hover
        ? null
        : hover.closing
          ? [
              anchors[from],
              anchors[from + 1],
              anchors[from + 4],
              anchors[from + 5],
              anchors[2],
              anchors[3],
              anchors[0],
              anchors[1],
            ]
          : [
              anchors[from],
              anchors[from + 1],
              anchors[from + 4],
              anchors[from + 5],
              hover.x,
              hover.y,
              hover.x,
              hover.y,
            ],
      closing: Boolean(hover?.closing),
    };
  } else if (stroke?.a) {
    marks = {
      anchors: stroke.a,
      closed: Boolean(stroke.closed),
      line: stroke.p,
      picked: anchor,
      handles: "all",
      preview: null,
      closing: false,
    };
  }

  return {
    down,
    move,
    up,
    cancel,
    /**
     * Round or corner – the anchors still to set while drawing, the picked
     * one while editing (null: nothing to say it of).
     */
    kind: ((): "smooth" | "corner" | null => {
      if (mode === "line") return corner ? "corner" : "smooth";
      if (!(stroke?.a && editing !== null && anchor !== null)) return null;
      return isSmooth(stroke.a, anchor) && !free.has(freeKey(editing, anchor))
        ? "smooth"
        : "corner";
    })(),
    setKind: (kind: "smooth" | "corner") => {
      if (mode === "line") {
        setCorner(kind === "corner");
        return;
      }
      if (!(stroke?.a && editing !== null && anchor !== null)) return;
      const key = freeKey(editing, anchor);
      const others = new Set([...free].filter((one) => one !== key));
      if (kind === "corner") {
        setFree(new Set([...others, key]));
        return;
      }
      setFree(others);
      const closed = Boolean(stroke.closed);
      put(
        replaced(
          art,
          editing,
          lineStroke(stroke.w, smoothen(stroke.a, closed, anchor), closed)
        )
      );
    },
    leave: () => {
      setHover(null);
      if (!press.current) setLines(null);
    },
    marks,
    lines: mode ? lines : null,
    /** A line is being drawn – there is something to finish. */
    active: mode === "line" && count > 0,
    finish,
    /** The last point of the line being drawn taken away – a step. */
    back: () => {
      if (drawing !== null) {
        const line = art.strokes[drawing];
        const a = line.a ?? [];
        const n = anchorCount(a);
        if (n > 2) {
          put(
            replaced(art, drawing, lineStroke(line.w, removeAnchor(a, n - 1)))
          );
        } else {
          // Down to its first point: no line any more.
          put({ ...art, strokes: art.strokes.slice(0, -1) });
          setLone(a.slice(0, ANCHOR));
          setDrawn(null);
        }
      } else setLone(null);
      setHover(null);
    },
    /** The line whose points are edited, and the one picked on it. */
    editing,
    anchor: editing !== null ? anchor : null,
    edit: (index: number) => {
      setEdited(index);
      setAnchor(null);
    },
    /** The picked point taken away – with fewer than two, the line. */
    removePoint: () => {
      if (!stroke?.a || editing === null || anchor === null) return;
      setAnchor(null);
      if (anchorCount(stroke.a) <= 2) {
        put({ ...art, strokes: art.strokes.filter((_, i) => i !== editing) });
        onLeave(null);
        return;
      }
      put(
        replaced(
          art,
          editing,
          lineStroke(stroke.w, removeAnchor(stroke.a, anchor), stroke.closed)
        )
      );
    },
    /** The edited line's width – and setting it, a step. */
    width: stroke?.w ?? null,
    restroke: (w: number) => {
      if (stroke && editing !== null && stroke.w !== w) {
        put(replaced(art, editing, { ...stroke, w }));
      }
    },
  };
};
