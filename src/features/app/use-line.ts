import { type RefObject, useEffect, useRef, useState } from "react";
import type { Art } from "@/features/calendar/art";
import {
  ANCHOR,
  anchorCount,
  isSmooth,
  lineStroke,
  removeAnchor,
  smoothen,
} from "@/features/calendar/bezier";
import type { Guides } from "@/features/calendar/guides";
import type { ShapeLike } from "@/features/calendar/shapes";
import {
  freeKey,
  type Hover,
  linePresses,
  type Press,
  replaced,
} from "./stamp-drawer/line-presses";
import type { Locate } from "./use-select";

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

/**
 * The line tool (L) and editing its lines' points (A), the way Figma and
 * Illustrator do it – not the pen, which draws freehand.
 *
 * - **Drawing:** clicks set points, straight lines between them; a press
 *   dragged bends the line there into a curve – a smooth point, its
 *   handles pulled out, mirrored (Alt: only the one ahead – a corner with
 *   a curve; ⇧: in 45° steps). A press on the first point closes the line;
 *   on another of its points picks that one – dragged, it moves. Each point
 *   is a step back; ⌫ takes the last one away, Enter or Escape – or another
 *   tool – ends the line. Until its second point a line is not in the
 *   drawing yet (`lone`).
 * - **Editing:** anchors and handles are dragged (a smooth point's handles
 *   stay mirrored – not with Alt), Alt-click switches smooth and corner, a
 *   click on the line puts a point there, Delete takes the picked one away.
 *   A press beside the line edits another such line – or leaves
 *   (`onLeave`); a finger that misses lets go of the picked point first.
 * - **A finger** reaches far (line-presses.ts `REACH`: 48 px across,
 *   however far zoomed in), and grabs the nearest of what lies within it
 *   (bezier.ts `pathGrip`).
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
  const [hover, setHover] = useState<Hover | null>(null);
  const [lines, setLines] = useState<Guides | null>(null);
  const press = useRef<Press | null>(null);
  // Round or corner: the anchors still to set, and those made corners while
  // editing (by their line and place) – their handles move each on its own.
  const [corner, setCorner] = useState(false);
  const [free, setFree] = useState<ReadonlySet<string>>(new Set());

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

  // The corners are known by their place: once anchors come or go – a point
  // put in or taken out, a step back – the places shift, and what was a
  // corner would be another anchor's. Then none is.
  const places = `${art.strokes.length}:${art.strokes
    .map((s) => (s.a ? anchorCount(s.a) : 0))
    .join(",")}`;
  const [freeAt, setFreeAt] = useState(places);
  if (freeAt !== places) {
    setFreeAt(places);
    if (free.size) setFree(new Set());
  }

  // Another tool: nothing under way, the stage's own cursor back.
  useEffect(() => {
    if (mode !== "line") {
      setLone(null);
      setDrawn(null);
      setHover(null);
    }
    if (mode !== "points") setEdited(null);
    setAnchor(null);
    setLines(null);
    press.current = null;
    if (area.current) {
      area.current.style.cursor = mode === "line" ? "crosshair" : "";
    }
  }, [mode, area]);

  const { draft, down, move } = linePresses({
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
  });

  /** The line being drawn is done – it stays as it is. */
  const finish = () => {
    setLone(null);
    setDrawn(null);
    setHover(null);
    setLines(null);
    setAnchor(null);
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
      picked: drawing !== null ? anchor : null,
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
