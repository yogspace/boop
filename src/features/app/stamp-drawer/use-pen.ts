import {
  type Dispatch,
  type PointerEvent,
  type SetStateAction,
  useEffect,
  useRef,
} from "react";
import type { Art, Point } from "@/features/calendar/art";
import { startErasing } from "@/features/calendar/eraser";
import { keepLine, type Steady, steady } from "@/features/calendar/freehand";
import { strokePath } from "@/features/calendar/stamp-svg";
import type { Tool } from "../draw-tools";
import { type History, meanwhile, settled, step } from "./history";
import { ERASERS, WIDTHS, type Width } from "./widths";

/**
 * The pen and the eraser: their tip over the stage, the line under way on a
 * layer of its own, the drawing rubbed away as the eraser goes.
 */

/**
 * The pen's string (px on screen, freehand.ts): a finger trembles more
 * than a mouse or a stylus.
 */
const STRING = { touch: 5, other: 2 };
/**
 * A line drawn keeps to what was drawn within this (px on screen), with a
 * point this near its corners.
 */
const KEEP = { tolerance: 0.45, near: 3 };

/** A freehand line under way: the brush on its string, its points so far. */
type Pen = {
  pointer: number;
  brush: Steady;
  points: Point[];
  width: number;
  /** When it was put down – a second finger soon after makes a pinch. */
  at: number;
  /** Px per face unit then. */
  unit: number;
};

/** Every point the screen saw since the last move – not just the last. */
const pointsOf = (event: PointerEvent<HTMLDivElement>) => {
  const native = event.nativeEvent as globalThis.PointerEvent;
  const all = native.getCoalescedEvents?.() ?? [];
  return all.length ? all : [native];
};

export const usePen = ({
  tool,
  width,
  art,
  setHistory,
  point,
  onStage,
  unitNow,
}: {
  tool: Tool;
  width: Width;
  /** The drawing now. */
  art: Art;
  setHistory: Dispatch<SetStateAction<History>>;
  /** Where the pen is on the face – kept on it (use-drawing-box.ts). */
  point: (event: {
    clientX: number;
    clientY: number;
  }) => readonly [number, number] | null;
  onStage: (u: number, v: number) => readonly [number, number];
  unitNow: () => number;
}) => {
  // The pen's tip over the stage, pointed at – moved without a render.
  const tip = useRef<HTMLSpanElement>(null);
  // The line under way: drawn on a layer of its own (and in the loupe).
  const live = useRef<SVGPathElement>(null);
  const liveCopy = useRef<SVGPathElement>(null);
  const pen = useRef<Pen | null>(null);
  // An erasing under way: what it began with, the eraser, what it shows.
  const erasing = useRef<{
    pointer: number;
    before: Art;
    eraser: ReturnType<typeof startErasing>;
    shows: Art;
    last: readonly [number, number];
    at: number;
  } | null>(null);

  /**
   * The pen's tip where the line would go – as wide as it draws, in the
   * stamp's ink (paper on an inverted stamp, where lines are cut out); the
   * eraser's, a ring as wide as it erases. Kept on the drawing as the line
   * is (`point`); nothing for a finger, which covers it anyway (the loupe
   * shows what is under it).
   */
  const showTip = (event: PointerEvent<HTMLDivElement>, at?: Point) => {
    const el = tip.current;
    const p = at ?? point(event);
    if (!(el && p)) return;
    if (event.pointerType === "touch") {
      el.style.opacity = "0";
      return;
    }
    const [x, y] = onStage(p[0], p[1]);
    const size = (tool === "eraser" ? ERASERS : WIDTHS)[width] * unitNow();
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    // See-through: a tip, not a dot already drawn.
    el.style.opacity = tool === "eraser" ? "0.9" : "0.6";
  };

  const hideTip = () => {
    if (tip.current) tip.current.style.opacity = "0";
  };

  // A special stamp's glitter (its sparkles turn and grow) rests while a
  // line is drawn or erased – nothing moves on the drawing but the line.
  const glitter = useRef<HTMLSpanElement>(null);
  const quiet = (on: boolean) => {
    if (glitter.current) glitter.current.style.display = on ? "none" : "";
  };

  /** The line under way, drawn on its layer – no render. */
  const drawLive = (points: readonly Point[], w: number) => {
    const d = strokePath(points.flat());
    for (const path of [live.current, liveCopy.current]) {
      if (!path) continue;
      path.setAttribute("d", d);
      path.setAttribute("stroke-width", String(w));
    }
  };
  const clearLive = () => {
    for (const path of [live.current, liveCopy.current]) {
      path?.setAttribute("d", "");
    }
  };

  // Erasing shows at most once a frame – many moves, one render.
  const eraseFrame = useRef(0);
  const showErased = (next: Art) => {
    if (eraseFrame.current) return;
    eraseFrame.current = requestAnimationFrame(() => {
      eraseFrame.current = 0;
      const rubbing = erasing.current;
      setHistory(meanwhile(rubbing ? rubbing.shows : next));
    });
  };
  useEffect(() => () => cancelAnimationFrame(eraseFrame.current), []);

  const penDown = (event: PointerEvent<HTMLDivElement>) => {
    const p = point(event);
    if (!p) return;
    const unit = unitNow();
    const reach =
      (event.pointerType === "touch" ? STRING.touch : STRING.other) / unit;
    pen.current = {
      pointer: event.pointerId,
      brush: steady(p[0], p[1], { reach }),
      points: [[p[0], p[1]]],
      width: WIDTHS[width],
      at: event.timeStamp,
      unit,
    };
    quiet(true);
    drawLive(pen.current.points, WIDTHS[width]);
  };

  const penMove = (event: PointerEvent<HTMLDivElement>) => {
    const drawing = pen.current;
    if (!drawing || drawing.pointer !== event.pointerId) return;
    if (event.shiftKey) {
      // ⇧: straight from where it began.
      const p = point(event);
      if (p) drawing.points = [drawing.points[0], [p[0], p[1]]];
    } else {
      for (const each of pointsOf(event)) {
        const p = point(each);
        if (p) drawing.points.push(...drawing.brush.to(p[0], p[1]));
      }
    }
    drawLive(drawing.points, drawing.width);
    showTip(event, drawing.points.at(-1));
  };

  const penUp = (event: PointerEvent<HTMLDivElement>) => {
    const drawing = pen.current;
    if (!drawing || drawing.pointer !== event.pointerId) return;
    pen.current = null;
    const p = point(event);
    if (p && !event.shiftKey) {
      drawing.points.push(...drawing.brush.end(p[0], p[1]));
    }
    const kept = keepLine(drawing.points, {
      tolerance: KEEP.tolerance / drawing.unit,
      near: KEEP.near / drawing.unit,
    });
    // One step, the line as kept – drawn before this frame is painted,
    // when its layer is cleared.
    setHistory((history) =>
      step(history, (now) => ({
        ...now,
        strokes: [...now.strokes, { w: drawing.width, p: kept }],
      }))
    );
    clearLive();
    quiet(false);
  };

  /** A line just begun goes – a pinch began instead. */
  const dropPen = () => {
    pen.current = null;
    clearLive();
    quiet(false);
  };

  const eraseDown = (event: PointerEvent<HTMLDivElement>) => {
    const p = point(event);
    if (!p) return;
    // It takes away as it goes; one step when it lets go.
    const eraser = startErasing(art, ERASERS[width]);
    eraser.add(p[0], p[1]);
    const next = eraser.art();
    erasing.current = {
      pointer: event.pointerId,
      before: art,
      eraser,
      shows: next,
      last: p,
      at: event.timeStamp,
    };
    quiet(true);
    if (next !== art) setHistory(meanwhile(next));
  };

  const eraseMove = (event: PointerEvent<HTMLDivElement>) => {
    const rubbing = erasing.current;
    if (!rubbing || rubbing.pointer !== event.pointerId) return;
    const close = 1 / unitNow();
    for (const each of pointsOf(event)) {
      const p = point(each);
      if (!p) continue;
      const [lx, ly] = rubbing.last;
      if (Math.hypot(p[0] - lx, p[1] - ly) < close) continue;
      rubbing.last = p;
      rubbing.eraser.add(p[0], p[1]);
    }
    const next = rubbing.eraser.art();
    if (next === rubbing.shows) return;
    rubbing.shows = next;
    showErased(next);
  };

  const stopErasing = (keep = true) => {
    const rubbing = erasing.current;
    erasing.current = null;
    cancelAnimationFrame(eraseFrame.current);
    eraseFrame.current = 0;
    if (!rubbing) return;
    quiet(false);
    if (!keep) {
      setHistory(meanwhile(rubbing.before));
      return;
    }
    if (rubbing.shows !== rubbing.before) {
      setHistory(meanwhile(rubbing.shows));
      setHistory(settled(rubbing.before));
    }
  };

  return {
    tip,
    live,
    liveCopy,
    glitter,
    pen,
    erasing,
    showTip,
    hideTip,
    penDown,
    penMove,
    penUp,
    dropPen,
    eraseDown,
    eraseMove,
    stopErasing,
  };
};
