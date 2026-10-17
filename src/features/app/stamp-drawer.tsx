"use client";

import { AnimatePresence, m, useIsPresent } from "motion/react";
import {
  type ChangeEvent,
  type FormEvent,
  type PointerEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Snapshot } from "valtio";
import { ArrowLeft, Bang, Cross, Sparkle } from "@/components/doodles";
import { SPRING } from "@/components/motion";
import { Button, Checkbox, Field, Notice, ROUND_BUTTON } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import { boxOf, NOTHING, type Selection } from "@/features/calendar/arrange";
import type { Art, Point } from "@/features/calendar/art";
import { startErasing } from "@/features/calendar/eraser";
import { keepLine, type Steady, steady } from "@/features/calendar/freehand";
import {
  type Guides,
  guidesFor,
  linesAt,
  snapMove,
} from "@/features/calendar/guides";
import { importSvg } from "@/features/calendar/import-svg";
import {
  type ColorName,
  type Drawing,
  RIMS,
  type RimPattern,
  type StampDoc,
  type StampShape,
} from "@/features/calendar/model";
import { MorphOutline } from "@/features/calendar/morph-outline";
import { rimLine } from "@/features/calendar/outline";
import { hexOf, knownKey, pickable } from "@/features/calendar/palette";
import { usePalette } from "@/features/calendar/palette-provider";
import { boxOfPieces, readPath } from "@/features/calendar/path";
import { knownShape } from "@/features/calendar/shapes";
import { useShapes, useTemplates } from "@/features/calendar/shapes-provider";
import {
  Glitter,
  ShapeOutline,
  StampSvg,
  strokePath,
} from "@/features/calendar/stamp-svg";
import {
  type DrawingTemplate,
  templateArt,
} from "@/features/calendar/templates";
import {
  createStamp,
  type StampChange,
  updateStamp,
  useBoop,
} from "@/features/offline/store";
import type { StickerInput } from "@/features/stickers/build";
import { STAGE, StickerView } from "@/features/stickers/sticker-view";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import {
  DONE_SIGN,
  LineMarks,
  Marks,
  REMOVE_SIGN,
  TOOL_KEYS,
  TOOL_SIGNS,
  TOOLS,
  type Tool,
} from "./draw-tools";
import { FADING, useFadingEdges } from "./fading-edges";
import { InkBlot } from "./ink-blot";
import { Loupe, type LoupeHandle } from "./loupe";
import { useLine } from "./use-line";
import { type Locate, NUDGE, useSelect } from "./use-select";
import {
  movedBy,
  pinched,
  toBox,
  toFace,
  useZoom,
  type View,
} from "./use-zoom";

/**
 * The pen's widths, relative to the stamp – from a hairline (as fine as a
 * 3D printer still prints at 40 mm: half a millimeter) to a marker.
 */
const WIDTHS = {
  hair: 0.012,
  thin: 0.022,
  medium: 0.036,
  thick: 0.055,
} as const;
type Width = keyof typeof WIDTHS;
/** The eraser's, one for each – wider: it takes away, it doesn't draw. */
const ERASERS: Record<Width, number> = {
  hair: 0.02,
  thin: 0.035,
  medium: 0.06,
  thick: 0.1,
};
/** How many steps undo reaches back. */
const STEPS_BACK = 100;
/** The drawing's distance from the stage's edge (px) – `inset-3` below. */
const INSET = 12;
/** An uploaded picture may be this big (bytes) – drawings are small. */
const MAX_UPLOAD = 1_000_000;
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
/**
 * A second finger this soon (ms) after the first makes them a pinch – the
 * line just begun goes. Later it is a palm, and left out.
 */
const PINCH_SOON = 250;
/** A finger on the line tool waits this long (ms) or this far (px) – a second may come. */
const HOLD = { ms: 160, px: 6 };
/** A template dropped in: this big (a share of the face). */
const TEMPLATE_SIZE = 0.42;
/** How near (px) a dropped template's edges and middle snap onto a guide. */
const SNAP = 6;
/**
 * Side by side – the stage on the left, what to set beside it: wide enough,
 * and wider than tall. Else one under the other, on the whole screen.
 */
const SIDE = "(min-width: 48rem) and (min-aspect-ratio: 1/1)";

const round = (n: number) => Math.round(n * 1000) / 1000;

const watchSide = (change: () => void) => {
  const query = matchMedia(SIDE);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
const useSideBySide = () =>
  useSyncExternalStore(
    watchSide,
    () => matchMedia(SIDE).matches,
    () => true
  );

/** A small line drawing on a button – `d` is what it shows. */
const Sign = ({ d, className }: { d: string; className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2.2"
    viewBox="0 0 24 24"
  >
    <path d={d} />
  </svg>
);
/** An arrow turning back – a step back. */
const UNDO = "M8.5 5.5 4 10l4.5 4.5M4 10h10.5a5 5 0 0 1 0 10H11";
/** The same arrow the other way – a step forward again. */
const REDO = "M15.5 5.5 20 10l-4.5 4.5M20 10H9.5a5 5 0 0 0 0 10H13";
/** A little bin – clearing the drawing. */
const BIN =
  "M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5M10.5 10.5v6M13.5 10.5v6";
/** An arrow up out of a tray – uploading a picture. */
const UPLOAD = "M12 15.5V4M7.5 8.5 12 4l4.5 4.5M4.5 15v4.5h15V15";
/** A magnifier – back to the whole face. */
const WHOLE_SIGN =
  "M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13ZM15.2 15.2 20 20";

/**
 * A shape or a rim to pick: a small scribbled tile, filled with ink when it
 * is the one (`aria-pressed`).
 */
const TILE =
  "scribble scribble-sm flex aspect-square w-full items-center justify-center rounded-xl transition-transform duration-150 ease-out hover:-rotate-6 active:scale-90 aria-pressed:scribble-ink aria-pressed:hover:rotate-0";

/** What is drawn: the lines – and an uploaded picture's filled areas. */
const BLANK: Art = { strokes: [], fills: [] };

/**
 * A stamp's drawing as the editor holds it – a copy of its own to change:
 * the lines with their anchors (to edit their points again), the filled
 * areas.
 */
const artOf = (drawing: Snapshot<Drawing> | null | undefined): Art => {
  const copy = drawing && (JSON.parse(JSON.stringify(drawing)) as Drawing);
  return copy ? { strokes: copy.strokes, fills: copy.fills ?? [] } : BLANK;
};

/**
 * Every step of the drawing (a line, a point of one, a picture, clearing,
 * an erasing, a move, a removal, a template) can be taken back and done
 * again: the ones before `now` and the ones taken back after it.
 */
type History = { past: Art[]; now: Art; future: Art[] };

/** A new step – what was taken back is gone then. */
const step = (history: History, next: (now: Art) => Art): History => ({
  past: [...history.past, history.now].slice(-STEPS_BACK),
  now: next(history.now),
  future: [],
});

/**
 * A gesture's change shown as it goes, without a step (`now` only) – then,
 * done, made one step from where it began (`before`).
 */
const meanwhile =
  (next: Art) =>
  (history: History): History => ({ ...history, now: next });

const settled =
  (before: Art) =>
  (history: History): History => ({
    past: [...history.past, before].slice(-STEPS_BACK),
    now: history.now,
    future: [],
  });

/** Whether a key goes to a field – then it is the field's, not a tool's. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  Boolean(target.closest("input, textarea, select, [contenteditable]"));

const back = ({ past, now, future }: History): History => {
  const before = past.at(-1);
  return before
    ? { past: past.slice(0, -1), now: before, future: [now, ...future] }
    : { past, now, future };
};

const forward = ({ past, now, future }: History): History => {
  const [next, ...rest] = future;
  return next
    ? { past: [...past, now], now: next, future: rest }
    : { past, now, future };
};

/** Two drawings in one – what is added comes on top. */
const joined = (art: Art, added: Art): Art => ({
  strokes: [...art.strokes, ...added.strokes],
  fills: [...art.fills, ...added.fills],
});

/** What `added` became in `joined(art, added)` – to pick it. */
const addedIn = (art: Art, added: Art): Selection => ({
  strokes: added.strokes.map((_, i) => art.strokes.length + i),
  fills: added.fills.map((_, i) => art.fills.length + i),
});

/** Art moved by (dx, dy) – lines with anchors keep them. */
const shifted = (art: Art, dx: number, dy: number): Art => {
  const move = (p: readonly number[]) =>
    p.map((v, i) => round(v + (i % 2 ? dy : dx)));
  return {
    strokes: art.strokes.map((s) => ({
      ...s,
      p: move(s.p),
      ...(s.a && { a: move(s.a) }),
    })),
    fills: art.fills.map((f) => ({ ...f, p: f.p.map(move) })),
  };
};

/**
 * Side by side, two sets of controls in one place, one of them showing: one
 * fades away, then the other comes, and the taller one sets the height – so
 * nothing around them moves. Where the room is too small, each scrolls on
 * its own (`grid-rows-1` on the place they share): the stamp's come from
 * their top, never from where the drawing's were scrolled to – down at the
 * button that made it 3D, past everything they have.
 */
const layer = (on: boolean) =>
  cn(
    "col-start-1 row-start-1 min-h-0 min-w-0 overflow-y-auto transition-[opacity,visibility] duration-200",
    FADING.y,
    on ? "delay-150" : "invisible opacity-0"
  );

/**
 * How the editor comes and goes: on a phone (one under the other) it slides
 * up from below and fills the screen; side by side it lies down in the
 * middle, like a sheet (sheet.tsx).
 */
const PHONE = {
  initial: { y: "100%", opacity: 0 },
  animate: {
    y: 0,
    opacity: 1,
    transition: { ...SPRING.soft, opacity: { duration: 0.15 } },
  },
  exit: {
    y: "100%",
    opacity: 0,
    transition: {
      duration: 0.24,
      ease: [0.4, 0, 0.9, 0.5],
      opacity: { duration: 0.12, delay: 0.12 },
    },
  },
} as const;
const DESKTOP = {
  initial: { y: 16, scale: 0.96, opacity: 0 },
  animate: {
    y: 0,
    scale: 1,
    opacity: 1,
    transition: { ...SPRING.soft, opacity: { duration: 0.2 } },
  },
  exit: {
    y: 8,
    scale: 0.96,
    opacity: 0,
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
  },
} as const;

/** A template's lines as a small picture – its own box, a little room round. */
const TemplateSign = ({ template }: { template: DrawingTemplate }) => {
  const box = useMemo(() => {
    const pieces = readPath(template.d);
    if (!pieces) return "0 0 100 100";
    const b = boxOfPieces(pieces);
    const side = Math.max(b.x1 - b.x0, b.y1 - b.y0);
    const pad = side * 0.12;
    const mx = (b.x0 + b.x1) / 2;
    const my = (b.y0 + b.y1) / 2;
    return `${mx - side / 2 - pad} ${my - side / 2 - pad} ${side + 2 * pad} ${side + 2 * pad}`;
  }, [template.d]);
  return (
    <svg aria-hidden="true" className="w-full" viewBox={box}>
      <path
        d={template.d}
        fill={template.filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={9}
        style={{ strokeWidth: 2 }}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

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

/**
 * Making a stamp: pick its body (it morphs from shape to shape) and a color
 * (it fades), doodle onto it – or drag a shape in, or upload a picture (SVG)
 * and draw on – and when done the drawing turns into the stamp right where
 * it is: a 3D rubber stamp to look at from every side, then to stamp with,
 * as often as you like. Back to drawing, the stamp flies back onto its
 * drawing the way it came. Saved on the device at once, synced later.
 *
 * On a phone it fills the screen and scrolls as one page: the drawing as
 * wide as it is, the bar with the steps back and forth under it – the two
 * stay at the top while the tools after them scroll by. Side by side, it
 * lies in the middle, the drawing as large as the screen allows.
 *
 * Drawing:
 * - The pen draws calm lines (freehand.ts): it follows on a short string,
 *   so a trembling finger draws a steady line; every point the screen
 *   reports goes in (coalesced events). What is under way is drawn on a
 *   layer of its own – one path – and joins the drawing as one step when
 *   the pen lifts.
 * - Two fingers zoom and move the view (use-zoom.ts) – so do a trackpad, ⌘
 *   with the wheel, the space bar with a drag; the drawing stays in its own
 *   units. On touch a loupe (loupe.tsx) shows what the finger covers.
 * - With a stylus only the stylus draws: fingers move the view, a palm
 *   leaves no line. A finger that comes after the first has drawn a while
 *   is taken for a palm, too.
 * - The page never scrolls or zooms under the drawing, and the drawing is a
 *   layer of its own (no mask or clip round it) – what changes repaints
 *   there alone.
 *
 * A stamp of one's own opens in it again (`stamp`), as it is: its drawing
 * – lines with their points, filled areas –, shape, color, rim, flags, name
 * and sharing. The steps begin there; saved, only what changed goes
 * (`updateStamp`), and its prints show it at once.
 */
export const StampDrawer = ({
  stamp,
  calendar,
  locale,
  onClose,
  onSaved,
  onDrawn,
  ask = 0,
}: {
  /** A stamp of one's own, drawn anew – none: a new one. */
  stamp?: Snapshot<StampDoc>;
  /**
   * The calendar it is drawn in, if its members may get to stamp with it too
   * – null when nobody else is in it. The stamp is its maker's either way.
   */
  calendar: string | null;
  locale: Locale;
  onClose: () => void;
  /** Told the stamp's id once it is saved – just before it closes. */
  onSaved?: (id: string) => void;
  /**
   * Told whether the browser's back should ask: something is drawn, and
   * the question isn't out yet.
   */
  onDrawn?: (drawn: boolean) => void;
  /** Counts up when the browser's back wants to leave: it asks. */
  ask?: number;
}) => {
  const t = dictionaryOf(locale);
  const titleId = useId();
  const side = useSideBySide();
  const going = !useIsPresent();
  const area = useRef<HTMLDivElement>(null);
  // The drawing box on the stage – what zooms, and its size in px.
  const paper = useRef<HTMLDivElement>(null);
  const [boxSize, setBoxSize] = useState(300);
  // The pen's tip over the stage, pointed at – moved without a render.
  const tip = useRef<HTMLSpanElement>(null);
  // The line under way: drawn on a layer of its own (and in the loupe).
  const live = useRef<SVGPathElement>(null);
  const liveCopy = useRef<SVGPathElement>(null);
  const loupe = useRef<LoupeHandle>(null);
  const file = useRef<HTMLInputElement>(null);
  // Side by side: the drawing's controls and the stamp's – each scrolls on
  // its own. On a phone the whole page scrolls instead.
  const drawControls = useFadingEdges();
  const stampControls = useFadingEdges();
  const page = useRef<HTMLDivElement>(null);
  const colorRow = useFadingEdges("x");
  const shapeRow = useFadingEdges("x");
  const templateRow = useFadingEdges("x");
  const [stage, setStage] = useState<"draw" | "3d">("draw");
  // A stamp drawn anew begins as it is – no step back to before it.
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    now: stamp ? artOf(stamp.drawing) : BLANK,
    future: [],
  }));
  const { strokes, fills } = history.now;
  const [width, setWidth] = useState<Width>("thin");
  const [refused, setRefused] = useState(false);
  // Prints the other way round: the face in ink, the doodle cut out.
  const [inverted, setInverted] = useState(Boolean(stamp?.drawing?.inverted));
  // The rim's pattern (none: plain), and whether it is for the big days.
  const [rim, setRim] = useState<RimPattern | undefined>(stamp?.drawing?.rim);
  const [special, setSpecial] = useState(Boolean(stamp?.drawing?.special));
  const shapes = useShapes();
  const templates = useTemplates();
  const [pickedShape, setShape] = useState<StampShape>(
    stamp?.shape ?? shapes[0]?.key ?? ""
  );
  const shape = knownShape(pickedShape, shapes);
  // Its color: one of the stamp colors one may pick (palette.ts – the
  // special ones are Boop's gifts', an admin account picks them too) – the
  // one picked as long as they have it; else, and to begin with, “grape” or
  // their first. A stamp drawn anew keeps its own among them, whichever.
  const { me } = useBoop();
  const colors = usePalette();
  const palette = pickable(colors, { admin: Boolean(me?.admin) }).concat(
    colors.filter((c) => c.special && !me?.admin && c.key === stamp?.color)
  );
  const [picked, setColor] = useState<ColorName>(stamp?.color ?? "grape");
  const color = knownKey(picked, palette);
  const [name, setName] = useState(stamp?.name ?? "");
  const [shared, setShared] = useState(
    Boolean(stamp && calendar && stamp.sharedWith.includes(calendar))
  );
  const [error, setError] = useState(false);
  // Drawing – freehand or point by point –, erasing, picking and moving,
  // or editing a line's points: the pen to begin with.
  const [tool, setTool] = useState<Tool>("pen");
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
  // Fingers on the stage, a stylus seen, the view moved by hand.
  const touches = useRef(new Map<number, readonly [number, number]>());
  const stylus = useRef(false);
  const viewing = useRef<ViewGesture | null>(null);
  const ignored = useRef(new Set<number>());
  const waiting = useRef<Waiting | null>(null);
  const toolAt = useRef(0);
  const spaceHeld = useRef(false);
  const [loupeOn, setLoupeOn] = useState(false);
  // What was dropped in, to pick once it is drawn.
  const [pickNext, setPickNext] = useState<Selection | null>(null);
  // A template being dragged in – and the guides it lies on.
  const [dropLines, setDropLines] = useState<Guides | null>(null);
  const dragging = useRef<{
    template: DrawingTemplate;
    pointer: number;
    before: Art;
    added: Art | null;
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);
  const ghost = useRef<HTMLSpanElement>(null);
  // What last pressed a template's tile – a finger's tap puts it in.
  const tilePointer = useRef("");
  const [ghostOf, setGhostOf] = useState<DrawingTemplate | null>(null);
  // The 3D view – a new one each time, counted – and the stamp it shows: the
  // drawing as it was made into one.
  const [view3d, setView3d] = useState(0);
  const [made, setMade] = useState<StickerInput | null>(null);
  // Its first frame is on screen: the drawing can fade away under it.
  const [shown, setShown] = useState(false);
  const draws = stage === "draw";
  const empty = !(strokes.length || fills.length);
  const zoom = useZoom(paper, draws);
  const { view } = zoom;
  const zoomed = view.s > 1.001;

  // three.js loads while drawing – the stamp is quick to appear.
  useEffect(() => {
    void import("three");
  }, []);

  // The page behind stays where it is – until the editor is gone.
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // The drawing box's size – for the pen's tip and the widths' dots.
  useLayoutEffect(() => {
    const el = paper.current;
    if (!el) return;
    const watch = new ResizeObserver(() => setBoxSize(el.clientWidth));
    watch.observe(el);
    setBoxSize(el.clientWidth);
    return () => watch.disconnect();
  }, []);

  /** Px per face unit on screen – the view zoomed in, more. */
  const unitNow = () =>
    ((paper.current?.clientWidth ?? boxSize) * zoom.latest.current.s) / 1.04;

  // The drawing box sits a little inside the stage, its view box reaching a
  // little beyond the unit square (its rim) – and zoomed, a part of it fills
  // the box: where on the face a pointer is, beyond it too, and how many px
  // a face unit is.
  const locate: Locate = (event) => {
    const box = paper.current?.getBoundingClientRect();
    if (!box?.width) return null;
    const v = zoom.latest.current;
    const [fx, fy] = toFace(
      v,
      (event.clientX - box.left) / box.width,
      (event.clientY - box.top) / box.height
    );
    return {
      x: -0.02 + 1.04 * fx,
      y: -0.02 + 1.04 * fy,
      unit: (box.width * v.s) / 1.04,
    };
  };

  /** Where in the drawing box (0–1) a client point lies. */
  const inBox = (clientX: number, clientY: number) => {
    const box = paper.current?.getBoundingClientRect();
    if (!box?.width) return [0, 0] as const;
    return [
      (clientX - box.left) / box.width,
      (clientY - box.top) / box.height,
    ] as const;
  };

  const changes = {
    live: (next: Art) => setHistory(meanwhile(next)),
    settle: (before: Art) => setHistory(settled(before)),
    put: (next: Art) => setHistory((history) => step(history, () => next)),
  };
  const select = useSelect({
    on: draws && tool === "move",
    area,
    art: history.now,
    shape,
    locate,
    ...changes,
    // Twice on a line with anchors: its points.
    onEdit: (stroke) => {
      setTool("points");
      line.edit(stroke);
    },
  });
  const line = useLine({
    mode: draws && (tool === "line" || tool === "points") ? tool : null,
    area,
    art: history.now,
    shape,
    width: WIDTHS[width],
    locate,
    ...changes,
    onLeave: (stroke) => leavePoints(stroke),
  });
  // The one line with anchors that is picked – its points can be edited.
  const anchored =
    tool === "move" &&
    select.picked &&
    !select.picked.items.fills.length &&
    select.picked.items.strokes.length === 1 &&
    history.now.strokes[select.picked.items.strokes[0]]?.a
      ? select.picked.items.strokes[0]
      : null;

  // What was dropped in is picked once it is drawn – to move, size, turn.
  useEffect(() => {
    if (!pickNext || tool !== "move") return;
    select.pick(pickNext);
    setPickNext(null);
  }, [pickNext, tool, select]);

  // The keys, while drawing and not in a field: ⌘Z / Ctrl+Z a step back,
  // with ⇧ (or Ctrl+Y) forward again; P or B the pen, L the line, E the
  // eraser, V picking, A a line's points – ⌘A all of it. ⌘+ and ⌘− zoom,
  // ⌘0 shows the whole face; the space bar held, a drag moves it. With
  // something picked: Escape lets go (before the sheet hears it and closes),
  // Delete removes it, the arrows move it, ⌘D a copy, ⌘C/⌘X/⌘V within the
  // editor. A line being drawn: Enter or Escape ends it, ⌫ takes its last
  // point. Editing points: Delete takes the picked one, Escape or Enter is
  // done.
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  keys.current = (event) => {
    if (typing(event.target)) return;
    const key = event.key.toLowerCase();
    const chosen = tool === "move" && select.picked;
    const removes = key === "delete" || key === "backspace";
    const ends = key === "enter" || key === "escape";
    if (event.metaKey || event.ctrlKey) {
      if (event.altKey) return;
      if (key === "z") setHistory(event.shiftKey ? forward : back);
      else if (key === "y") setHistory(forward);
      else if (key === "+" || key === "=") zoom.zoomBy(1.5);
      else if (key === "-") zoom.zoomBy(1 / 1.5);
      else if (key === "0") zoom.reset();
      else if (key === "a") {
        chooseTool("move");
        select.all();
      } else if (key === "d" && chosen) select.duplicate();
      else if (key === "c" && chosen) select.copy();
      else if (key === "x" && chosen) select.cut();
      else if (key === "v" && select.paste()) chooseTool("move");
      else return;
      event.preventDefault();
      return;
    }
    if (event.altKey) return;
    if (key === " ") {
      spaceHeld.current = true;
      if (area.current) area.current.style.cursor = "grab";
    } else if (key === "p" || key === "b") chooseTool("pen");
    else if (key === "l") chooseTool("line");
    else if (key === "e") chooseTool("eraser");
    else if (key === "v") chooseTool("move");
    else if (key === "a") editPoints();
    else if (tool === "line" && line.active && ends) {
      line.finish();
      event.stopImmediatePropagation();
    } else if (tool === "line" && line.active && removes) line.back();
    else if (tool === "points" && ends) {
      leavePoints(line.editing);
      event.stopImmediatePropagation();
    } else if (tool === "points" && line.anchor !== null && removes) {
      line.removePoint();
    } else if (chosen && key === "escape") {
      select.clear();
      event.stopImmediatePropagation();
    } else if (chosen && removes) {
      select.remove();
    } else if (chosen && key.startsWith("arrow")) {
      const by = event.shiftKey ? NUDGE.big : NUDGE.small;
      const way = key.slice(5);
      select.nudge(
        way === "left" ? -by : way === "right" ? by : 0,
        way === "up" ? -by : way === "down" ? by : 0
      );
    } else return;
    event.preventDefault();
  };
  useEffect(() => {
    if (!draws) return;
    const onKey = (event: KeyboardEvent) => keys.current(event);
    const onUp = (event: KeyboardEvent) => {
      if (event.key !== " ") return;
      spaceHeld.current = false;
      if (area.current) area.current.style.cursor = "";
    };
    // Caught on the way down – before the frame's Escape.
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("keyup", onUp);
    };
  }, [draws]);

  const doodle = useMemo(
    () => ({ strokes, fills, inverted, rim, special }),
    [strokes, fills, inverted, rim, special]
  );
  const sticker = useMemo(
    () => ({ shape, color, drawing: doodle }),
    [shape, color, doodle]
  );
  const ink = hexOf(color);
  // The line under way, in the ink – paper on an inverted stamp, where lines
  // are cut out of the inked face.
  const liveInk = inverted ? `color-mix(in srgb, ${ink} 14%, white)` : ink;

  // Where the pen is on the face – kept on it.
  const point = (event: { clientX: number; clientY: number }) => {
    const at = locate(event);
    if (!at) return null;
    const unit = (n: number) => Math.min(Math.max(n, 0), 1);
    return [unit(at.x), unit(at.y)] as const;
  };

  /** A point of the face as px of the stage. */
  const onStage = (u: number, v: number) => {
    const box = paper.current;
    const size = box?.clientWidth ?? boxSize;
    const [bx, by] = toBox(
      zoom.latest.current,
      (u + 0.02) / 1.04,
      (v + 0.02) / 1.04
    );
    return [INSET + bx * size, INSET + by * size] as const;
  };

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

  /** Every point the screen saw since the last move – not just the last. */
  const pointsOf = (event: PointerEvent<HTMLDivElement>) => {
    const native = event.nativeEvent as globalThis.PointerEvent;
    const all = native.getCoalescedEvents?.() ?? [];
    return all.length ? all : [native];
  };

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
    const eraser = startErasing(history.now, ERASERS[width]);
    eraser.add(p[0], p[1]);
    const next = eraser.art();
    erasing.current = {
      pointer: event.pointerId,
      before: history.now,
      eraser,
      shows: next,
      last: p,
      at: event.timeStamp,
    };
    quiet(true);
    if (next !== history.now) setHistory(meanwhile(next));
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

  // Another tool ends what the one before was at – a line being drawn
  // stays as far as it got.
  const chooseTool = (next: Tool) => {
    stopErasing();
    dropPen();
    setTool(next);
  };

  // A line's points: the picked line's, if it is one with anchors – else
  // the next one clicked.
  const editPoints = () => {
    chooseTool("points");
    if (anchored !== null) line.edit(anchored);
  };

  // Done with the points: back to picking, the line picked.
  const leavePoints = (stroke: number | null) => {
    chooseTool("move");
    if (stroke !== null) select.pick({ strokes: [stroke], fills: [] });
  };

  // A step of its own – it can be taken back, too.
  const clear = () => setHistory((history) => step(history, () => BLANK));

  // A picture takes the place of what was there – then it is drawn on.
  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    // The same file can be picked again.
    event.target.value = "";
    if (!chosen) return;
    setRefused(false);
    try {
      if (chosen.size > MAX_UPLOAD) throw new Error("too big");
      const picture = await importSvg(await chosen.text());
      if (!picture) throw new Error("nothing in it");
      setHistory((history) =>
        step(history, () => ({
          strokes: picture.strokes,
          fills: picture.fills,
        }))
      );
    } catch {
      setRefused(true);
    }
  };

  /** A template as it would land with its middle at (x, y) – snapped. */
  const landing = (
    template: DrawingTemplate,
    before: Art,
    x: number,
    y: number
  ) => {
    const added = templateArt(template, {
      x,
      y,
      size: TEMPLATE_SIZE,
      width: WIDTHS[width],
    });
    const box = boxOf(added, {
      strokes: added.strokes.map((_, i) => i),
      fills: added.fills.map((_, i) => i),
    });
    if (!box) return { added, lines: null };
    const guides = guidesFor(before, NOTHING, shape);
    const [dx, dy] = snapMove(box, 0, 0, guides, SNAP / unitNow());
    const lines = linesAt(
      { x0: box.x0 + dx, y0: box.y0 + dy, x1: box.x1 + dx, y1: box.y1 + dy },
      guides
    );
    return {
      added: dx || dy ? shifted(added, dx, dy) : added,
      lines: lines.x.length || lines.y.length ? lines : null,
    };
  };

  /** A template put in – the middle of the face, or where it was dropped. */
  const putTemplate = (template: DrawingTemplate, at = { x: 0.5, y: 0.5 }) => {
    const before = history.now;
    const { added } = landing(template, before, at.x, at.y);
    if (!(added.strokes.length || added.fills.length)) return;
    setHistory((history) => step(history, (now) => joined(now, added)));
    chooseTool("move");
    setPickNext(addedIn(before, added));
  };

  /** Dragging a template from its tile: into the drawing, where it lands. */
  const templateDown = (
    event: PointerEvent<HTMLButtonElement>,
    template: DrawingTemplate
  ) => {
    tilePointer.current = event.pointerType;
    // A finger scrolls the row and taps – the tap puts it in the middle.
    if (event.pointerType === "touch" || event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
    dragging.current = {
      template,
      pointer: event.pointerId,
      before: history.now,
      added: null,
      moved: false,
      x: event.clientX,
      y: event.clientY,
    };
  };

  const templateMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragging.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) {
        return;
      }
      drag.moved = true;
      setGhostOf(drag.template);
    }
    const at = locate(event);
    const over = at && at.x > 0 && at.y > 0 && at.x < 1 && at.y < 1;
    if (ghost.current) {
      ghost.current.style.transform = `translate(${event.clientX}px, ${event.clientY}px) translate(-50%, -50%)`;
      ghost.current.style.opacity = over ? "0" : "1";
    }
    if (!(at && over)) {
      if (drag.added) {
        drag.added = null;
        setHistory(meanwhile(drag.before));
        setDropLines(null);
      }
      return;
    }
    const { added, lines } = landing(drag.template, drag.before, at.x, at.y);
    drag.added = added;
    setDropLines(lines);
    setHistory(meanwhile(joined(drag.before, added)));
  };

  const templateUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragging.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    dragging.current = null;
    setGhostOf(null);
    setDropLines(null);
    if (!drag.moved) {
      // A click: into the middle.
      putTemplate(drag.template);
      return;
    }
    if (!drag.added) return;
    setHistory(settled(drag.before));
    chooseTool("move");
    setPickNext(addedIn(drag.before, drag.added));
  };

  // On a phone each step begins at the top of the page: the title, the
  // stage, what to set first – never scrolled to where the other one's end
  // was, under the stage.
  const toTop = () => page.current?.scrollTo({ top: 0 });

  const toStamp = () => {
    stopErasing();
    dropPen();
    setRefused(false);
    setShown(false);
    // Face-on, the stamp lies right over the whole drawing.
    zoom.reset();
    setMade(sticker);
    setView3d((n) => n + 1);
    setStage("3d");
    toTop();
  };

  // The drawing comes back under the stamp, which flies onto it and fades
  // (out of its presence, it stays until it has landed).
  const toDrawing = () => {
    setStage("draw");
    setShown(false);
    toTop();
  };

  // The drawing as a stamp keeps it – and, for one drawn anew, what differs
  // from how it came in (as the editor first showed it): that is what saving
  // sends, and what closing would throw away.
  const drawingNow = useMemo(
    (): Drawing => ({
      v: 1,
      strokes,
      ...(fills.length > 0 && { fills }),
      ...(inverted && { inverted: true as const }),
      ...(rim && { rim }),
      ...(special && { special: true as const }),
    }),
    [strokes, fills, inverted, rim, special]
  );
  const anew = Boolean(stamp);
  const drawingText = useMemo(
    () => (anew ? JSON.stringify(drawingNow) : ""),
    [anew, drawingNow]
  );
  const [first] = useState(() => ({
    drawing: drawingText,
    shape,
    color,
    shared,
  }));
  const change: StampChange = {};
  if (stamp) {
    if (drawingText !== first.drawing) change.drawing = drawingNow;
    if (shape !== first.shape) change.shape = shape;
    if (color !== first.color) change.color = color;
    const named = name.trim().slice(0, 40);
    if (named !== stamp.name) change.name = named;
    if (calendar && shared !== first.shared) {
      const rest = stamp.sharedWith.filter((id) => id !== calendar);
      change.sharedWith = shared ? [...rest, calendar] : rest;
    }
  }

  // Something drawn – or changed: closing would throw it away, so it asks
  // first – the X, Escape, and the browser's back (`ask`). Asked, closing
  // once more is the answer: away with it.
  const drawn = stamp
    ? Object.keys(change).length > 0
    : strokes.length > 0 || fills.length > 0;
  const [leaving, setLeaving] = useState(false);
  // The browser's back asks only once: asked, it goes like the X.
  useEffect(() => onDrawn?.(drawn && !leaving), [drawn, leaving, onDrawn]);
  useEffect(() => () => onDrawn?.(false), [onDrawn]);
  /** Gone for good – saved, or thrown away. */
  const leave = () => {
    onDrawn?.(false);
    onClose();
  };
  const close = () => {
    if (drawn && !leaving) setLeaving(true);
    else leave();
  };
  // The browser's back is a close like the others – counted up while open
  // (not what it found at the start), it reaches the latest `close`.
  const closing = useRef(close);
  closing.current = close;
  const askedBefore = useRef(ask);
  useEffect(() => {
    if (ask === askedBefore.current) return;
    askedBefore.current = ask;
    closing.current();
  }, [ask]);
  // Escape closes – unless a tool took it first (`keys`, caught earlier).
  useEffect(() => {
    if (going) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closing.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [going]);

  // Its button, or Enter in the name – with the keyboard up, the keyboard's
  // own key saves, whatever it covers.
  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setError(false);
    try {
      if (stamp) {
        await updateStamp(stamp.id, change);
        onSaved?.(stamp.id);
        leave();
        return;
      }
      const id = await createStamp({
        name: name.trim().slice(0, 40),
        color,
        shape,
        drawing: drawingNow,
        sharedWith: shared && calendar ? [calendar] : [],
      });
      trackEvent("stamp-created");
      onSaved?.(id);
      leave();
    } catch {
      setError(true);
    }
  };

  // The face: drawn anew only when the drawing, its shape or color change –
  // not as the view moves. Once more for the loupe.
  const face = useMemo(
    () => (
      <StampSvg
        className="pointer-events-none absolute inset-0 h-full w-full"
        color={color}
        drawing={doodle}
        filled
        morph
        shape={shape}
      />
    ),
    [color, doodle, shape]
  );
  const faceCopy = useMemo(
    () =>
      loupeOn ? (
        <StampSvg
          className="pointer-events-none absolute inset-0 h-full w-full"
          color={color}
          drawing={doodle}
          filled
          morph
          shape={shape}
        />
      ) : null,
    [color, doodle, shape, loupeOn]
  );
  const clipId = useId();
  /**
   * The layer the line under way is drawn on – inside the outline, and never
   * beyond its own box: however the line grows, the layer keeps its size.
   */
  const liveLayer = (ref: typeof live, id: string) => (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
      viewBox="-2 -2 104 104"
    >
      <defs>
        <clipPath id={id}>
          <MorphOutline shape={shape} />
        </clipPath>
      </defs>
      <g transform="scale(100)">
        <g clipPath={`url(#${id})`}>
          <path
            fill="none"
            ref={ref}
            stroke={liveInk}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
    </svg>
  );
  const worldStyle = {
    transform: `translate(${(view.x * 100).toFixed(3)}%, ${(view.y * 100).toFixed(3)}%) scale(${view.s.toFixed(4)})`,
  };
  // The size a width draws at on screen – its dot on the button.
  const dotOf = (w: number) =>
    Math.min(32, Math.max(1.5, (w * boxSize * view.s) / 1.04));

  const stageEl = (
    // The stage stays where it is: the drawing, then the stamp over it.
    <div
      aria-label={draws ? t.app.draw.hint : t.app.draw.turn}
      className={cn(
        STAGE,
        // Its paper lies under it, a layer of its own (below).
        "bg-transparent bg-none",
        "touch-none select-none [-webkit-touch-callout:none] [-webkit-user-select:none]",
        // The tip shows where the pen is – no arrow on top of it. With the
        // other tools the pointer says what a press would do.
        draws && (tool === "pen" || tool === "eraser") && "cursor-none"
      )}
      onPointerCancel={draws ? onUp : undefined}
      onPointerDown={draws ? onDown : undefined}
      onPointerLeave={draws ? onLeave : undefined}
      onPointerMove={draws ? onMove : undefined}
      onPointerUp={draws ? onUp : undefined}
      ref={area}
      role="application"
    >
      {/* The paper and its dots, under the frame: a layer of its own that
          never changes – nothing drawn on it ever paints it again. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-2 transform-[translateZ(0)] rounded-[inherit] bg-card bg-[radial-gradient(var(--color-line)_1.3px,transparent_1.3px)] bg-size-[18px_18px] contain-strict"
      />
      {/* The drawing box: the one layer that changes as a line is drawn
          (will-change), its size fixed and its paint kept inside it
          (contain) – drawing repaints it alone, and only within its square,
          zoomed in or not. */}
      <div
        className={cn(
          "absolute inset-3 transition-opacity duration-300 will-change-transform contain-strict",
          !draws && shown && "opacity-0"
        )}
        ref={paper}
      >
        <div className="absolute inset-0 origin-top-left" style={worldStyle}>
          {face}
          {liveLayer(live, `${clipId}-live`)}
        </div>
      </div>
      {/* What the tools mark on it, over it – it may reach beyond its box
          (a frame's handles, the knob to turn with). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-3">
        {draws && tool === "move" && (
          <Marks
            art={history.now}
            className="absolute inset-0"
            hover={select.hover}
            knob={select.knob}
            lines={select.lines ?? dropLines}
            marquee={select.marquee}
            picked={select.picked}
            view={view}
          />
        )}
        {draws && tool !== "move" && dropLines && (
          <Marks
            art={history.now}
            className="absolute inset-0"
            hover={null}
            knob={false}
            lines={dropLines}
            marquee={null}
            picked={null}
            view={view}
          />
        )}
        {draws && (tool === "line" || tool === "points") && (
          <LineMarks
            className="absolute inset-0"
            lines={line.lines}
            marks={line.marks}
            touch={select.knob}
            view={view}
          />
        )}
      </div>
      {draws && (tool === "pen" || tool === "eraser") && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-0 left-0 rounded-full opacity-0 transition-opacity duration-100",
            // The eraser's: only its ring – it puts nothing down.
            tool === "eraser"
              ? "border-[1.5px] border-ink ring-1 ring-white/80"
              : "ring-1 ring-ink/50"
          )}
          ref={tip}
          style={{
            background:
              tool === "eraser" ? "transparent" : inverted ? "#ffffff" : ink,
          }}
        />
      )}
      {draws && special && !empty && !zoomed && (
        // A taste of what its prints will do.
        <span
          className="pointer-events-none absolute inset-3 animate-fade"
          ref={glitter}
        >
          <Glitter color={color} drawing={doodle} shape={shape} sheen={false} />
        </span>
      )}
      {draws && empty && (
        <p
          className={cn(
            "pointer-events-none absolute inset-0 flex animate-fade items-center justify-center font-bold",
            // On an inverted stamp's inked face.
            inverted ? "text-white" : "text-muted"
          )}
        >
          {t.app.draw.hint}
        </p>
      )}
      {draws && refused && (
        // On the stage, where the picture would have come – nothing moves.
        <div className="pointer-events-none absolute inset-x-3 bottom-3 text-center">
          <Notice tone="error">{t.app.draw.uploadFailed}</Notice>
        </div>
      )}
      {draws && zoomed && (
        <button
          aria-label={t.app.draw.zoomReset}
          className="scribble scribble-sm absolute right-4 bottom-4 z-10 flex h-9 items-center gap-1 rounded-full px-3 font-black text-xs"
          onClick={zoom.reset}
          onPointerDown={(event) => event.stopPropagation()}
          title={t.app.draw.zoomReset}
          type="button"
        >
          <Sign className="h-4 w-4" d={WHOLE_SIGN} />
          {Math.round(view.s * 100)} %
        </button>
      )}
      {loupeOn && draws && (
        <Loupe ref={loupe}>
          {/* The paper's dots, where they lie on the stage. */}
          <div className="absolute -inset-3 bg-[radial-gradient(var(--color-line)_1.3px,transparent_1.3px)] bg-size-[18px_18px]" />
          <div className="absolute inset-0 origin-top-left" style={worldStyle}>
            {faceCopy}
            {liveLayer(liveCopy, `${clipId}-copy`)}
          </div>
          {(tool === "line" || tool === "points") && (
            <LineMarks
              className="absolute inset-0"
              lines={null}
              marks={line.marks}
              touch
              view={view}
            />
          )}
        </Loupe>
      )}
      <AnimatePresence>
        {!draws && made && (
          // Right over the drawing – its first frame looks just like it,
          // and so does its last.
          <StickerView
            className="absolute inset-0"
            flyBack
            inset={INSET}
            key={view3d}
            onShown={() => setShown(true)}
            stamp={made}
          />
        )}
      </AnimatePresence>
      {!draws && (
        <>
          <Sparkle className="pointer-events-none absolute -top-3 -left-2 h-7 w-7 animate-boop text-ink [animation-delay:700ms]" />
          <Sparkle className="pointer-events-none absolute -right-2 -bottom-2 h-5 w-5 animate-boop text-ink [animation-delay:850ms]" />
        </>
      )}
    </div>
  );

  // Round or corner – a line's point (line tool: those still to set).
  const kindEl = line.kind && (tool === "line" || tool === "points") && (
    <fieldset className="flex items-center gap-1.5">
      <legend className="sr-only">{t.app.draw.anchor}</legend>
      <span aria-hidden="true" className="mr-0.5 font-bold text-muted text-xs">
        {t.app.draw.anchor}
      </span>
      {(["smooth", "corner"] as const).map((kind) => (
        <button
          aria-pressed={line.kind === kind}
          className="scribble scribble-sm rounded-full px-3 py-1 font-bold text-xs aria-pressed:scribble-ink"
          key={kind}
          onClick={() => line.setKind(kind)}
          title={
            kind === "smooth"
              ? t.app.draw.anchorSmoothHint
              : t.app.draw.anchorCornerHint
          }
          type="button"
        >
          {kind === "smooth"
            ? t.app.draw.anchorSmooth
            : t.app.draw.anchorCorner}
        </button>
      ))}
    </fieldset>
  );

  // The steps back and forth – and clearing it all. Side by side beside the
  // tools; on a phone under the drawing (`barEl`).
  const historyEl = (
    <div className="flex shrink-0 items-center gap-1.5">
      {(
        [
          [
            t.app.draw.undo,
            UNDO,
            history.past.length > 0,
            () => setHistory(back),
            "Meta+Z Control+Z",
          ],
          [
            t.app.draw.redo,
            REDO,
            history.future.length > 0,
            () => setHistory(forward),
            "Meta+Shift+Z Control+Shift+Z Control+Y",
          ],
        ] as const
      ).map(([label, sign, able, go, keys]) => (
        <button
          aria-keyshortcuts={keys}
          aria-label={label}
          // Filled while there is a step to take – it should be seen;
          // faint while there is none (like the day's, day-page.tsx).
          className={cn(ROUND_BUTTON, "h-11 w-11", able && "scribble-ink")}
          disabled={!able}
          key={label}
          onClick={go}
          title={label}
          type="button"
        >
          <Sign className="h-6 w-6" d={sign} />
        </button>
      ))}
    </div>
  );
  const clearEl = (
    // Red, like every button that deletes something.
    <button
      aria-label={t.app.draw.clear}
      className={cn(ROUND_BUTTON, "scribble-danger h-11 w-11")}
      disabled={empty}
      onClick={clear}
      title={t.app.draw.clear}
      type="button"
    >
      <Sign className="h-5 w-5" d={BIN} />
    </button>
  );

  const toolsEl = (
    // The tools – side by side, the steps back and forth and clearing it
    // all beside them.
    <div className="flex flex-wrap items-center justify-between gap-2">
      <fieldset className="flex gap-1.5">
        <legend className="sr-only">{t.app.draw.tools}</legend>
        {TOOLS.map((each) => {
          const label = t.app.draw[each];
          return (
            <button
              aria-keyshortcuts={TOOL_KEYS[each]}
              aria-label={label}
              // Editing points belongs to picking.
              aria-pressed={
                tool === each || (each === "move" && tool === "points")
              }
              className={cn(TILE, "w-10 p-2")}
              key={each}
              onClick={() => chooseTool(each)}
              title={`${label} (${TOOL_KEYS[each]})`}
              type="button"
            >
              <Sign className="w-full" d={TOOL_SIGNS[each]} />
            </button>
          );
        })}
      </fieldset>
      {side && (
        <div className="flex shrink-0 items-center gap-1.5">
          {historyEl}
          {clearEl}
        </div>
      )}
    </div>
  );

  // On a phone: the steps back and forth on the left, clearing on the
  // right – right under the drawing, as wide as it, like under the day's
  // page (day-page.tsx); it stays there with the drawing as the page
  // scrolls. Made 3D, there is nothing to take back: it goes – it lies
  // under the stage, which stays where it is.
  const barEl = (
    <div
      className={cn(
        "flex items-center justify-between gap-2 pt-2",
        draws ? "animate-fade" : "hidden"
      )}
    >
      {historyEl}
      {clearEl}
    </div>
  );

  const widthsEl = (
    // How thick the pen, the line or the eraser is – or, picking, the
    // picked lines (none pressed when they differ), editing points, that
    // line; and what the tool has to finish or remove.
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-2 gap-y-2">
      <fieldset
        className="flex gap-1.5"
        disabled={
          tool === "move" &&
          Boolean(select.picked) &&
          !select.picked?.items.strokes.length
        }
      >
        <legend className="sr-only">{t.app.draw.width}</legend>
        {(Object.keys(WIDTHS) as Width[]).map((w) => {
          const size = dotOf(tool === "eraser" ? ERASERS[w] : WIDTHS[w]);
          return (
            <button
              aria-label={t.app.draw.widths[w]}
              aria-pressed={
                tool === "move" && select.picked
                  ? select.width === WIDTHS[w]
                  : tool === "points" && line.editing !== null
                    ? line.width === WIDTHS[w]
                    : width === w
              }
              className={cn(TILE, "w-10 disabled:opacity-40")}
              key={w}
              onClick={() =>
                tool === "move" && select.picked
                  ? select.restroke(WIDTHS[w])
                  : tool === "points" && line.editing !== null
                    ? line.restroke(WIDTHS[w])
                    : setWidth(w)
              }
              title={t.app.draw.widths[w]}
              type="button"
            >
              {/* The tip, as big as it draws on the stage right now – the
                  eraser's a ring. */}
              <span
                aria-hidden="true"
                className={cn(
                  "block rounded-full",
                  tool === "eraser"
                    ? "border-[1.5px] border-current"
                    : "bg-current"
                )}
                style={{ width: size, height: size }}
              />
            </button>
          );
        })}
      </fieldset>
      <div className="ml-auto flex shrink-0 gap-0.5">
        {anchored !== null && (
          <Button
            aria-keyshortcuts={TOOL_KEYS.points}
            aria-label={t.app.draw.points}
            className="px-2.5"
            onClick={editPoints}
            size="sm"
            title={`${t.app.draw.points} (${TOOL_KEYS.points})`}
            variant="ghost"
          >
            <Sign className="h-5 w-5" d={TOOL_SIGNS.points} />
          </Button>
        )}
        {tool === "move" && (
          <Button
            aria-keyshortcuts="Delete"
            aria-label={t.app.draw.removeSelection}
            className="px-3"
            disabled={!select.picked}
            onClick={select.remove}
            size="sm"
            title={`${t.app.draw.removeSelection} (⌫)`}
            variant="danger"
          >
            <Sign className="h-5 w-5" d={REMOVE_SIGN} />
            {t.app.draw.remove}
          </Button>
        )}
        {tool === "points" && (
          <Button
            aria-keyshortcuts="Delete"
            aria-label={t.app.draw.removePoint}
            className="px-2.5"
            disabled={line.anchor === null}
            onClick={line.removePoint}
            size="sm"
            title={`${t.app.draw.removePoint} (⌫)`}
            variant="danger"
          >
            <Sign className="h-5 w-5" d={REMOVE_SIGN} />
          </Button>
        )}
        {/* No Enter on a phone: a button ends the line, or the editing. */}
        {(tool === "line" || tool === "points") && (
          <Button
            aria-keyshortcuts="Enter"
            className="px-2.5"
            disabled={tool === "line" && !line.active}
            onClick={() =>
              tool === "line" ? line.finish() : leavePoints(line.editing)
            }
            size="sm"
            variant="ghost"
          >
            <Sign className="h-5 w-5" d={DONE_SIGN} />
            {t.app.draw.finish}
          </Button>
        )}
      </div>
    </div>
  );

  // A line on how the tool goes – keys with a keyboard, gestures on touch –
  // and for a line's points, round or corner.
  const hintEl = (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <p className="min-w-0 flex-1 text-muted text-xs leading-snug">
        {
          {
            pen: select.knob ? t.app.draw.penHintTouch : t.app.draw.penHint,
            line: select.knob ? t.app.draw.lineHintTouch : t.app.draw.lineHint,
            eraser: t.app.draw.eraserHint,
            move: select.knob ? t.app.draw.moveHintTouch : t.app.draw.moveHint,
            points: select.knob
              ? t.app.draw.pointsHintTouch
              : t.app.draw.pointsHint,
          }[tool]
        }
      </p>
      {kindEl}
    </div>
  );

  const templateTiles = templates.map((template) => (
    <button
      aria-label={template.name[locale]}
      className={cn(TILE, "w-11 shrink-0 touch-pan-x p-2")}
      key={template.key}
      onClick={(event) => {
        // A finger's tap, or the keyboard – a mouse or a stylus drags (or
        // clicks) through the pointer's own events.
        if (event.detail === 0 || tilePointer.current === "touch") {
          putTemplate(template);
        }
      }}
      onPointerCancel={templateUp}
      onPointerDown={(event) => templateDown(event, template)}
      onPointerMove={templateMove}
      onPointerUp={templateUp}
      title={`${template.name[locale]} – ${
        select.knob ? t.app.draw.templatesHintTouch : t.app.draw.templatesHint
      }`}
      type="button"
    >
      <TemplateSign template={template} />
    </button>
  ));

  const templatesEl = (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 font-bold text-sm">
        {t.app.draw.templates}
        {/* How – beside it on a phone; side by side a tooltip (no room). */}
        <span
          className={cn(
            "ml-2 font-medium text-muted text-xs",
            side && "sr-only"
          )}
        >
          {select.knob
            ? t.app.draw.templatesHintTouch
            : t.app.draw.templatesHint}
        </span>
      </legend>
      {/* An own picture first – it stays where it is. Then the templates:
          side by side as they fit, row after row; on a phone in one row
          beside it, swiped along, fading where it goes on (room inside for
          the tiles' lift). */}
      <div className={cn("flex gap-1.5", side && "flex-wrap")}>
        <button
          aria-label={t.app.draw.upload}
          className={cn(TILE, "scribble-dashed w-11 shrink-0 p-2")}
          onClick={() => file.current?.click()}
          title={t.app.draw.upload}
          type="button"
        >
          <Sign className="w-full" d={UPLOAD} />
        </button>
        <input
          accept=".svg,image/svg+xml"
          hidden
          onChange={onUpload}
          ref={file}
          type="file"
        />
        {side ? (
          templateTiles
        ) : (
          <div
            className={cn(
              "-my-2 -mr-2 flex min-w-0 flex-1 gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain py-2 pr-2 pl-0.5",
              FADING.x
            )}
            ref={templateRow}
          >
            {templateTiles}
          </div>
        )}
      </div>
    </fieldset>
  );

  const shapesEl = (
    // The shapes – they morph into each other. Side by side in two rows; on
    // a phone in one, swiped along (its edges fade where it goes on), so
    // the tools stay near the drawing.
    <fieldset className="flex min-w-0 flex-col">
      <legend className="mb-1.5 font-bold text-sm">{t.app.draw.shape}</legend>
      <div
        className={
          side
            ? "grid max-w-76 grid-cols-6 gap-1.5"
            : cn(
                "-m-2 flex gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain p-2",
                FADING.x
              )
        }
        ref={side ? undefined : shapeRow}
      >
        {shapes.map(({ key: s, name: names }) => (
          <button
            aria-label={names[locale]}
            aria-pressed={shape === s}
            className={cn(TILE, "p-1.5", !side && "w-12 shrink-0")}
            key={s}
            onClick={() => setShape(s)}
            title={names[locale]}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="w-full"
              viewBox="-0.05 -0.05 1.1 1.1"
            >
              <ShapeOutline
                fill="none"
                shape={s}
                stroke="currentColor"
                strokeWidth="0.1"
              />
            </svg>
          </button>
        ))}
      </div>
    </fieldset>
  );

  const colorsEl = (
    <fieldset className="flex min-w-0 flex-col">
      <legend className="mb-1.5 font-bold text-sm">{t.app.draw.color}</legend>
      {/* Blots of the stamp colors, the one picked ringed – like the day's
          stamp pads. On a phone one row, never two: what doesn't fit is
          swiped to, and fades where it goes on – room all round inside for
          a blot's ring and lift. Wider, they wrap. */}
      <div
        className={cn(
          "-m-3 flex items-center gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain p-3 sm:m-0 sm:flex-wrap sm:overflow-visible sm:mask-none sm:p-0",
          FADING.x
        )}
        ref={colorRow}
      >
        {palette.map(({ key: c, hex, name: names }, i) => (
          <button
            aria-label={names[locale]}
            aria-pressed={color === c}
            className={cn(
              "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform",
              color === c ? "scale-110" : "hover:-rotate-6 hover:scale-110"
            )}
            key={c}
            onClick={() => setColor(c)}
            title={names[locale]}
            type="button"
          >
            <InkBlot hex={hex} index={i} on={color === c} />
          </button>
        ))}
      </div>
    </fieldset>
  );

  const rimsEl = (
    // The rim's patterns, each on the shape picked – seven in a row.
    <fieldset className="flex flex-col">
      <legend className="mb-1.5 font-bold text-sm">{t.app.draw.rim}</legend>
      <div className="grid w-full max-w-80 grid-cols-7 gap-1.5">
        {[undefined, ...RIMS].map((r) => {
          // The pattern bigger, so it shows on a button – its line a little
          // finer than that.
          const look = rimLine(shape, r, { scale: 3.5 });
          return (
            <button
              aria-label={t.app.draw.rims[r ?? "plain"]}
              aria-pressed={rim === r}
              className={cn(TILE, "p-1")}
              key={r ?? "plain"}
              onClick={() => setRim(r)}
              title={t.app.draw.rims[r ?? "plain"]}
              type="button"
            >
              <svg
                aria-hidden="true"
                className="w-full"
                viewBox="-0.08 -0.08 1.16 1.16"
              >
                <path
                  d={look.d}
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap={look.cap}
                  strokeLinejoin="round"
                  strokeWidth={look.width * 0.85}
                />
              </svg>
            </button>
          );
        })}
      </div>
    </fieldset>
  );

  const restEl = (
    <>
      {/* The two boxes in one line – on a phone too. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Checkbox
          checked={inverted}
          onChange={(event) => setInverted(event.target.checked)}
        >
          {t.app.draw.inverted}
        </Checkbox>
        <Checkbox
          checked={special}
          onChange={(event) => setSpecial(event.target.checked)}
        >
          {t.app.draw.special}
        </Checkbox>
      </div>
      <Button
        className="w-full"
        disabled={empty}
        onClick={toStamp}
        size={side ? "md" : "lg"}
      >
        {t.app.draw.make3d} <Sparkle className="h-5 w-5" />
      </Button>
    </>
  );

  const backEl = (
    <div className="flex h-11 items-center justify-between gap-2">
      <Button
        className="shrink-0"
        onClick={toDrawing}
        size="sm"
        variant="plain"
      >
        <ArrowLeft className="h-4 w-4" /> {t.app.draw.back}
      </Button>
      <p className="min-w-0 text-right font-medium text-muted text-sm leading-tight">
        {t.app.draw.turn}
      </p>
    </div>
  );

  const saveEl = (
    <form className="flex flex-col gap-4" onSubmit={onSave}>
      <Field
        label={t.app.draw.name}
        maxLength={40}
        onChange={(event) => setName(event.target.value)}
        placeholder={t.app.draw.namePlaceholder}
        value={name}
      />
      {calendar && (
        <Checkbox
          checked={shared}
          onChange={(event) => setShared(event.target.checked)}
        >
          {t.app.draw.shared}
        </Checkbox>
      )}
      {stamp && (
        // What changing it does – everywhere it was ever stamped.
        <p className="font-medium text-muted text-sm">{t.app.draw.editNote}</p>
      )}
      {error && <Notice tone="error">{t.auth.failed}</Notice>}
      <Button className="w-full" size="lg" type="submit">
        {stamp ? t.app.draw.saveChanges : t.app.draw.save}
      </Button>
    </form>
  );

  // What is set while drawing – and, made 3D, what is left to do.
  const drawSet = (
    <>
      {shapesEl}
      {colorsEl}
      <div className="flex flex-col gap-2">
        {toolsEl}
        {widthsEl}
        {hintEl}
      </div>
      {templatesEl}
      {rimsEl}
      {restEl}
    </>
  );
  const stampSet = (
    <>
      {backEl}
      {saveEl}
    </>
  );

  // Watch out, like the other questions that throw something away: a thick
  // frame and an exclamation mark – over the drawing, where it is seen.
  const questionEl = leaving && (
    <div
      aria-labelledby={`${titleId}-leave`}
      className="scribble scribble-bold absolute inset-x-3 top-3 z-30 flex animate-fade flex-col gap-3 rounded-2xl p-4"
      role="alertdialog"
    >
      <p className="flex items-start gap-2.5 font-bold" id={`${titleId}-leave`}>
        <Bang className="h-6 w-6 shrink-0" />
        {stamp ? t.app.draw.editLeaveTitle : t.app.draw.leaveTitle}
      </p>
      <p className="font-medium text-muted text-sm">
        {stamp ? t.app.draw.editLeaveText : t.app.draw.leaveText}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={leave} size="sm" variant="ghost">
          {t.app.draw.leaveGo}
        </Button>
        <Button
          autoFocus
          onClick={() => setLeaving(false)}
          size="sm"
          variant="plain"
        >
          {t.app.draw.leaveStay}
        </Button>
      </div>
    </div>
  );

  const header = (
    <div className="flex shrink-0 items-center justify-between gap-3">
      <h2 className="font-black text-2xl" id={titleId}>
        {!draws
          ? t.app.draw.done
          : stamp
            ? t.app.draw.editTitle
            : t.app.draw.title}
      </h2>
      <button
        aria-label="Close"
        className={ROUND_BUTTON}
        onClick={close}
        type="button"
      >
        <Cross className="h-5 w-5" />
      </button>
    </div>
  );

  // A template on its way in, under the pointer – until it is over the
  // drawing, where it shows as itself.
  const ghostEl = ghostOf && (
    <span
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-60 w-12 text-ink"
      ref={ghost}
    >
      <TemplateSign template={ghostOf} />
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden touch-manipulation">
      {side && (
        // The page fades back like paper under tracing paper.
        <m.button
          animate={{ opacity: 1, transition: { duration: 0.24 } }}
          aria-label="Close"
          className="fixed inset-0 touch-none bg-bg/80 backdrop-blur-[2px]"
          exit={{ opacity: 0, transition: { duration: 0.2, ease: "easeIn" } }}
          initial={{ opacity: 0 }}
          onClick={going ? undefined : close}
          tabIndex={going ? -1 : undefined}
          type="button"
        />
      )}
      {side ? (
        <div className="pointer-events-none flex h-full items-center justify-center p-6">
          <m.div
            {...DESKTOP}
            aria-labelledby={titleId}
            aria-modal="true"
            className="scribble pointer-events-auto relative flex max-h-full max-w-full flex-col gap-4 rounded-4xl p-6"
            inert={going}
            role="dialog"
          >
            {header}
            <div className="relative flex min-h-0 gap-6">
              {/* As large as the screen allows: as tall as the room under
                  the title, as wide as beside the controls. */}
              <div className="w-[min(calc(100dvh-9.5rem),calc(100vw-32rem),56rem)] shrink-0">
                {stageEl}
              </div>
              <div className="-my-2 grid min-h-0 w-88 shrink-0 grid-rows-1">
                <div
                  className={cn(layer(draws), "px-1 py-2")}
                  ref={drawControls}
                >
                  <div className="flex flex-col gap-3">{drawSet}</div>
                </div>
                <div
                  className={cn(layer(!draws), "px-1 py-2")}
                  ref={stampControls}
                >
                  <div className="flex flex-col gap-4">{stampSet}</div>
                </div>
              </div>
              {questionEl}
            </div>
          </m.div>
        </div>
      ) : (
        <m.div
          {...PHONE}
          aria-labelledby={titleId}
          aria-modal="true"
          className="absolute inset-0 flex flex-col bg-bg pt-[max(0.75rem,env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]"
          inert={going}
          role="dialog"
        >
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            ref={page}
          >
            <div className="px-4 pb-2">{header}</div>
            {/* The drawing and the bar under it, one block: drawing, it
                stays at the top while what comes after scrolls by – on the
                page's own paper, which a short fade lets go of below; the
                frames keep the room they wobble in. Made 3D, it goes with
                the page: nothing to set lies under it then. */}
            <div
              className={cn(
                "z-10 bg-bg pt-1 pb-2",
                draws
                  ? "sticky top-0 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-linear-to-b after:from-bg after:to-transparent"
                  : "relative"
              )}
            >
              {/* As wide as the screen, square – and never so tall that the
                  tools under it have no room. */}
              <div className="mx-auto w-full max-w-[min(100%,calc(100dvh-22rem))] px-2">
                {stageEl}
              </div>
              {/* As wide as the drawing – but never narrower than its
                  buttons. */}
              <div className="mx-auto w-full max-w-[min(100%,max(calc(100dvh-22rem),11rem))] px-2">
                {barEl}
              </div>
              {questionEl}
            </div>
            {/* Only the set showing is there – the page as long as it is. */}
            <div
              className={cn(
                "flex flex-col gap-4 px-4 pt-3 pb-4",
                draws ? "animate-fade" : "hidden"
              )}
            >
              {drawSet}
            </div>
            <div
              className={cn(
                "flex-col gap-4 px-4 pt-3 pb-4",
                draws ? "hidden" : "flex animate-fade"
              )}
            >
              {stampSet}
            </div>
          </div>
        </m.div>
      )}
      {ghostEl}
    </div>
  );
};
