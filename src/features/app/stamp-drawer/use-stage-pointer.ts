import { type PointerEvent, type RefObject, useRef, useState } from "react";
import type { Tool } from "../draw-tools";
import type { LoupeHandle } from "../loupe";
import type { useLine } from "../use-line";
import type { useSelect } from "../use-select";
import { movedBy, pinched, type View } from "../use-zoom";
import type { usePen } from "./use-pen";

/**
 * The stage's pointers: which go to the tool, which move the view – two
 * fingers, a drag with the space bar held, fingers where a stylus draws –
 * and which are a palm, left out. On touch a loupe shows what the finger
 * covers.
 */

/**
 * A second finger this soon (ms) after the first makes them a pinch – the
 * line just begun goes. Later it is a palm, and left out.
 */
const PINCH_SOON = 250;
/** A finger on the line tool waits this long (ms) or this far (px) – a second may come. */
const HOLD = { ms: 160, px: 6 };

/** The view moved by hand: two fingers pinching, or one (or the mouse) dragging. */
type ViewGesture =
  | {
      kind: "pinch";
      ids: [number, number];
      from: View;
      start: [readonly [number, number], readonly [number, number]];
    }
  | { kind: "pan"; id: number; from: View; start: readonly [number, number] };

/** A finger down on the line tool, not handed on yet – a second may come. */
type Waiting = {
  pointer: number;
  at: number;
  x: number;
  y: number;
  event: PointerEvent<HTMLDivElement>;
};

export const useStagePointer = ({
  tool,
  area,
  paper,
  zoom,
  zoomed,
  inBox,
  select,
  line,
  freehand,
  setRefused,
}: {
  tool: Tool;
  area: RefObject<HTMLDivElement | null>;
  /** The drawing box on the stage. */
  paper: RefObject<HTMLDivElement | null>;
  zoom: { latest: RefObject<View>; set: (next: View) => void };
  zoomed: boolean;
  /** Where in the drawing box (0–1) a client point lies. */
  inBox: (clientX: number, clientY: number) => readonly [number, number];
  select: ReturnType<typeof useSelect>;
  line: ReturnType<typeof useLine>;
  /** The pen and the eraser (use-pen.ts). */
  freehand: ReturnType<typeof usePen>;
  setRefused: (refused: boolean) => void;
}) => {
  const {
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
  } = freehand;
  const loupe = useRef<LoupeHandle>(null);
  // Fingers on the stage, a stylus seen, the view moved by hand.
  const touches = useRef(new Map<number, readonly [number, number]>());
  const stylus = useRef(false);
  const viewing = useRef<ViewGesture | null>(null);
  const ignored = useRef(new Set<number>());
  const waiting = useRef<Waiting | null>(null);
  const toolAt = useRef(0);
  const spaceHeld = useRef(false);
  const [loupeOn, setLoupeOn] = useState(false);

  /** The loupe over a finger at a client point – over the page, anywhere. */
  const showLoupe = (event: { clientX: number; clientY: number }) => {
    const own = paper.current?.getBoundingClientRect();
    if (!own?.width) return;
    loupe.current?.show({
      clientX: event.clientX,
      clientY: event.clientY,
      x: event.clientX - own.left,
      y: event.clientY - own.top,
      side: own.width,
    });
  };
  const hideLoupe = () => loupe.current?.hide();

  /** What the tool does with a pointer put down – one at a time. */
  const toolDown = (event: PointerEvent<HTMLDivElement>) => {
    toolAt.current = event.timeStamp;
    if (tool === "move") {
      select.down(event);
      return;
    }
    if (tool === "line" || tool === "points") {
      setRefused(false);
      line.down(event);
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) return;
    showTip(event);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer knows – it draws all the same.
    }
    setRefused(false);
    if (tool === "eraser") eraseDown(event);
    else penDown(event);
  };

  const toolMove = (event: PointerEvent<HTMLDivElement>) => {
    if (tool === "move") select.move(event);
    else if (tool === "line" || tool === "points") line.move(event);
    else {
      if (tool === "eraser") eraseMove(event);
      else penMove(event);
      if (!(pen.current || erasing.current)) showTip(event);
    }
  };

  const toolUp = (event: PointerEvent<HTMLDivElement>) => {
    if (tool === "move") select.up(event);
    else if (tool === "line" || tool === "points") line.up();
    else if (tool === "eraser") stopErasing();
    else penUp(event);
  };

  /** Whatever the tool was at stops – two fingers took over. */
  const abortTool = () => {
    dropPen();
    stopErasing(false);
    waiting.current = null;
    line.cancel();
    select.cancel();
  };

  /** A finger held on the line tool goes to it now. */
  const handOn = () => {
    const held = waiting.current;
    waiting.current = null;
    if (held) toolDown(held.event);
  };

  const startPinch = () => {
    const ids = [...touches.current.keys()].slice(0, 2) as [number, number];
    const [a, b] = ids.map((id) => {
      const [x, y] = touches.current.get(id) ?? [0, 0];
      return inBox(x, y);
    });
    viewing.current = {
      kind: "pinch",
      ids,
      from: zoom.latest.current,
      start: [a, b],
    };
    hideLoupe();
    hideTip();
  };

  const startPan = (event: PointerEvent<HTMLDivElement>) => {
    viewing.current = {
      kind: "pan",
      id: event.pointerId,
      from: zoom.latest.current,
      start: inBox(event.clientX, event.clientY),
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Moved all the same.
    }
    if (area.current) area.current.style.cursor = "grabbing";
  };

  const moveView = (event: PointerEvent<HTMLDivElement>) => {
    const g = viewing.current;
    if (!g) return;
    if (g.kind === "pinch") {
      const [a, b] = g.ids.map((id) => touches.current.get(id));
      if (!(a && b)) return;
      zoom.set(pinched(g.from, g.start, [inBox(...a), inBox(...b)]));
      return;
    }
    if (g.id !== event.pointerId) return;
    const [x, y] = inBox(event.clientX, event.clientY);
    zoom.set(movedBy(g.from, x - g.start[0], y - g.start[1]));
  };

  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    const touch = event.pointerType === "touch";
    if (event.pointerType === "pen") stylus.current = true;
    if (touch) {
      touches.current.set(event.pointerId, [event.clientX, event.clientY]);
      if (!loupeOn) setLoupeOn(true);
    }
    // Moving the view by hand: the wheel's button or the space bar held –
    // or, where a stylus draws, a finger.
    if (!touch && (event.button === 1 || spaceHeld.current)) {
      event.preventDefault();
      startPan(event);
      return;
    }
    if (touch && stylus.current) {
      if (touches.current.size >= 2) startPinch();
      else if (zoomed) startPan(event);
      return;
    }
    if (touch && touches.current.size === 2 && !viewing.current) {
      // Two fingers on what is picked turn and size it; elsewhere they zoom.
      if (tool === "move") {
        select.down(event);
        if (select.pinching()) return;
        select.cancel();
        startPinch();
        return;
      }
      const soon =
        waiting.current !== null ||
        event.timeStamp - toolAt.current < PINCH_SOON;
      if (soon) {
        abortTool();
        startPinch();
        return;
      }
      // Well into a line: a palm – left out.
      ignored.current.add(event.pointerId);
      return;
    }
    if (touch && touches.current.size > 2) {
      ignored.current.add(event.pointerId);
      return;
    }
    if (viewing.current) return;
    if (touch) showLoupe(event);
    // A finger on the line tool waits a moment – a second may come.
    if (touch && (tool === "line" || tool === "points")) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Waited for all the same.
      }
      event.persist?.();
      waiting.current = {
        pointer: event.pointerId,
        at: event.timeStamp,
        x: event.clientX,
        y: event.clientY,
        event,
      };
      toolAt.current = event.timeStamp;
      return;
    }
    toolDown(event);
  };

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const touch = event.pointerType === "touch";
    if (touch && touches.current.has(event.pointerId)) {
      touches.current.set(event.pointerId, [event.clientX, event.clientY]);
    }
    if (viewing.current) {
      moveView(event);
      return;
    }
    if (ignored.current.has(event.pointerId)) return;
    if (touch && stylus.current) return;
    const held = waiting.current;
    if (held && held.pointer === event.pointerId) {
      showLoupe(event);
      const far = Math.hypot(event.clientX - held.x, event.clientY - held.y);
      if (far < HOLD.px && event.timeStamp - held.at < HOLD.ms) return;
      handOn();
    }
    if (touch && (pen.current || erasing.current || tool !== "pen")) {
      showLoupe(event);
    }
    toolMove(event);
  };

  const onUp = (event: PointerEvent<HTMLDivElement>) => {
    touches.current.delete(event.pointerId);
    const g = viewing.current;
    if (g) {
      const mine =
        g.kind === "pinch"
          ? g.ids.includes(event.pointerId)
          : g.id === event.pointerId;
      if (mine) {
        viewing.current = null;
        if (area.current) {
          area.current.style.cursor = spaceHeld.current ? "grab" : "";
        }
      }
      return;
    }
    if (ignored.current.delete(event.pointerId)) return;
    const held = waiting.current;
    if (held && held.pointer === event.pointerId) handOn();
    toolUp(event);
    hideLoupe();
  };

  const onLeave = () => {
    if (tool === "move") select.leave();
    else if (tool === "line" || tool === "points") line.leave();
    hideTip();
  };

  return { onDown, onMove, onUp, onLeave, loupe, loupeOn, spaceHeld };
};
