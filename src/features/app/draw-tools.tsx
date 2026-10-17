import { useLayoutEffect, useRef, useState } from "react";
import {
  type Frame,
  HANDLES,
  outOfFrame,
  type Selection,
} from "@/features/calendar/arrange";
import type { Art, Box } from "@/features/calendar/art";
import { ANCHOR, anchorCount, noHandle } from "@/features/calendar/bezier";
import type { Guides } from "@/features/calendar/guides";
import { strokePath } from "@/features/calendar/stamp-svg";
import { cn } from "@/lib/cn";
import type { LineMarking } from "./use-line";
import { KNOB, type Picked } from "./use-select";

/**
 * The drawing tools in their row (stamp-drawer/tool-controls.tsx): the pen
 * (freehand), the line (straight from point to point, or bent into curves),
 * the eraser, picking and moving. A fifth has no button there – editing
 * such a line's points (`points`): from a double click on one, its key, or
 * the button that comes with one picked.
 */
export const TOOLS = ["pen", "line", "eraser", "move"] as const;
export type Tool = (typeof TOOLS)[number] | "points";

/**
 * Each tool's key – the letters Figma uses (B: its pencil – P draws with
 * the pen here, too; L: its line).
 */
export const TOOL_KEYS: Record<Tool, string> = {
  pen: "B",
  line: "L",
  eraser: "E",
  move: "V",
  points: "A",
};

/** What each tool's button shows – a small line drawing (24 × 24). */
export const TOOL_SIGNS: Record<Tool, string> = {
  // A pencil, writing down to the left.
  pen: "M4.5 19.5 5.6 15 15.8 4.8a2.1 2.1 0 0 1 3 3L8.6 18l-4.1 1.5ZM14 6.6l3.4 3.4",
  // A line bent between two points.
  line: "M6.5 16.5C10 5 14 19 17.5 7.5M4 16.5h3.5V20H4ZM16.5 4H20v3.5h-3.5Z",
  // A rubber, tilted, the line it leaves clean.
  eraser:
    "M13.6 4.6a1.7 1.7 0 0 1 2.4 0l3.4 3.4a1.7 1.7 0 0 1 0 2.4L10.8 19H7.2l-2.8-2.8a1.7 1.7 0 0 1 0-2.4ZM8.6 9.6l5.8 5.8M12 19h8",
  // The pointer.
  move: "M6 3.5v15.2l4-3.8 2.7 6 2.7-1.2-2.7-5.9H18.5Z",
  // A point on a line, its two handles out.
  points:
    "M5 12h14M10.2 10.2h3.6v3.6h-3.6ZM3.6 10.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8ZM20.4 10.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8ZM4.5 20C9 20 9.5 15.5 12 13.8",
};

/** A tick – done. */
export const DONE_SIGN = "M5 12.5 10 17.5 19 7";

/** A dashed box with a cross – taking what is picked away. */
export const REMOVE_SIGN =
  "M4 7.5V4h3.5M10.2 4h3.6M16.5 4H20v3.5M20 10.2v3.6M20 16.5V20h-3.5M13.8 20h-3.6M7.5 20H4v-3.5M4 13.8v-3.6M9.5 9.5l5 5M14.5 9.5l-5 5";

/**
 * The smart guides' color: a clear magenta, like Figma's – apart from the
 * ink of the marks and from every stamp color, on a white edge.
 */
const GUIDE = "#e5007e";

/** How the drawing is zoomed and moved (use-zoom.ts) – none: all of it. */
type ViewLike = { s: number; x: number; y: number };
const WHOLE_VIEW: ViewLike = { s: 1, x: 0, y: 0 };

/**
 * A pointer's px from a point on the face (its square, with the rim) – in
 * the view as it is zoomed and moved, along x or y.
 */
const toPx =
  (size: number, view: ViewLike = WHOLE_VIEW, axis: "x" | "y" = "x") =>
  (u: number) =>
    (view[axis] + (view.s * (u + 0.02)) / 1.04) * size;

/** A closed outline through flat pairs. */
const ringPath = (p: readonly number[]) => {
  let d = "";
  for (let i = 0; i + 1 < p.length; i += 2) {
    d += `${i ? "L" : "M"}${p[i].toFixed(1)} ${p[i + 1].toFixed(1)}`;
  }
  return `${d}Z`;
};

/** The overlay's side in px – it lies exactly over the drawing. */
const useSide = () => {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const watch = new ResizeObserver(() => setSize(el.clientWidth));
    watch.observe(el);
    setSize(el.clientWidth);
    return () => watch.disconnect();
  }, []);
  return [box, size] as const;
};

/** A thin inked line on a white edge – readable on paper and on ink. */
const Line = ({ d, dashed }: { d: string; dashed?: boolean }) => (
  <>
    <path d={d} stroke="white" strokeOpacity={0.8} strokeWidth={3.5} />
    <path
      d={d}
      stroke="var(--color-ink)"
      strokeDasharray={dashed ? "5 4" : undefined}
      strokeWidth={1.5}
    />
  </>
);

/** The guides something has snapped to – across the whole face. */
const GuideLines = ({
  lines,
  px,
  py,
  size,
}: {
  lines: Guides;
  px: (u: number) => number;
  py: (u: number) => number;
  size: number;
}) => {
  const d = [
    ...lines.x.map((x) => `M${px(x).toFixed(1)} 0V${size}`),
    ...lines.y.map((y) => `M0 ${py(y).toFixed(1)}H${size}`),
  ].join("");
  return (
    <>
      <path d={d} stroke="white" strokeOpacity={0.8} strokeWidth={3} />
      <path d={d} stroke={GUIDE} strokeWidth={1} />
    </>
  );
};

/** The outlines of some lines and areas – thin, like Figma's hover. */
const Outlines = ({
  art,
  items,
  px,
  py,
}: {
  art: Art;
  items: Selection;
  px: (u: number) => number;
  py: (u: number) => number;
}) => {
  const pair = (p: readonly number[]) =>
    p.map((v, i) => (i % 2 ? py(v) : px(v)));
  const paths = [
    ...items.fills.flatMap((i) =>
      (art.fills[i]?.p ?? [])
        .filter((ring) => ring.length >= 6)
        .map((ring) => ringPath(pair(ring)))
    ),
    ...items.strokes.flatMap((i) => {
      const stroke = art.strokes[i];
      return stroke ? [strokePath(pair(stroke.p))] : [];
    }),
  ].join("");
  return <Line d={paths} />;
};

/**
 * What the selection tool draws over the drawing, in the scribble's ink:
 * the outline of the thing under the pointer and of what is picked, the
 * picked things' frame – dashed, like a marker's – with round handles at
 * its corners and sides (on touch bigger, and a knob above it to turn
 * with), the box being dragged to pick with, and the guides what is
 * dragged has snapped to – across the whole face. Laid exactly over the
 * drawing; it never takes a pointer.
 */
export const Marks = ({
  art,
  hover,
  picked,
  marquee,
  lines,
  knob,
  view,
  className,
}: {
  art: Art;
  hover: Selection | null;
  picked: Picked | null;
  marquee: Box | null;
  lines: Guides | null;
  knob: boolean;
  /** How the drawing is zoomed and moved – the marks keep their size. */
  view?: ViewLike;
  className?: string;
}) => {
  const [box, size] = useSide();
  const px = toPx(size, view, "x");
  const py = toPx(size, view, "y");
  const unit = (size * (view?.s ?? 1)) / 1.04;
  const frame = picked?.frame;
  const corner = (f: Frame, hx: number, hy: number) => {
    const [x, y] = outOfFrame(f, (hx * f.w) / 2, (hy * f.h) / 2);
    return [px(x), py(y)] as const;
  };
  const handle = knob ? 7 : 5;
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none", className)}
      ref={box}
    >
      {size > 0 && (
        <svg
          aria-hidden="true"
          className="h-full w-full overflow-visible"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox={`0 0 ${size} ${size}`}
        >
          {hover && <Outlines art={art} items={hover} px={px} py={py} />}
          {picked && (
            <Outlines art={art} items={picked.items} px={px} py={py} />
          )}
          {frame && (
            <>
              {(() => {
                const d = `${[
                  [-1, -1],
                  [1, -1],
                  [1, 1],
                  [-1, 1],
                ]
                  .map(([hx, hy], i) => {
                    const [x, y] = corner(frame, hx, hy);
                    return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
                  })
                  .join("")}Z`;
                return (
                  <>
                    <path
                      d={d}
                      stroke="white"
                      strokeOpacity={0.8}
                      strokeWidth={4}
                    />
                    <path
                      d={d}
                      stroke="var(--color-ink)"
                      strokeDasharray="6 5"
                      strokeWidth={2}
                    />
                  </>
                );
              })()}
              {knob &&
                (() => {
                  const [tx, ty] = corner(frame, 0, -1);
                  const [kx, ky] = outOfFrame(
                    frame,
                    0,
                    -frame.h / 2 - KNOB / unit
                  );
                  return (
                    <>
                      <path
                        d={`M${tx} ${ty}L${px(kx)} ${py(ky)}`}
                        stroke="var(--color-ink)"
                        strokeWidth={2}
                      />
                      <circle
                        cx={px(kx)}
                        cy={py(ky)}
                        fill="white"
                        r={9}
                        stroke="var(--color-ink)"
                        strokeWidth={2}
                      />
                      {/* A little turning arrow in it. */}
                      <path
                        d="M-3.5 1.5a3.6 3.6 0 1 0 1-3.6M-3.3-4.2l.8 2.3 2.3-.7"
                        stroke="var(--color-ink)"
                        strokeWidth={1.6}
                        transform={`translate(${px(kx)} ${py(ky)})`}
                      />
                    </>
                  );
                })()}
              {HANDLES.map(([hx, hy]) => {
                // A side's handle only where the side has room for it.
                const side = hx ? frame.h : frame.w;
                if (!(hx && hy) && side * unit < handle * 9) return null;
                const [x, y] = corner(frame, hx, hy);
                return (
                  <circle
                    cx={x}
                    cy={y}
                    fill="white"
                    key={`${hx},${hy}`}
                    r={hx && hy ? handle : handle - 1}
                    stroke="var(--color-ink)"
                    strokeWidth={2}
                  />
                );
              })}
            </>
          )}
          {lines && <GuideLines lines={lines} px={px} py={py} size={size} />}
          {marquee && (
            <rect
              fill="var(--color-ink)"
              fillOpacity={0.05}
              height={py(marquee.y1) - py(marquee.y0)}
              stroke="var(--color-ink)"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              width={px(marquee.x1) - px(marquee.x0)}
              x={px(marquee.x0)}
              y={py(marquee.y0)}
            />
          )}
        </svg>
      )}
    </div>
  );
};

/**
 * What the line tool and editing its points draw over the drawing – precise,
 * in the scribble's ink: the line itself, thin; its anchors as small
 * squares (the picked one filled and ringed, the first one ringed when a
 * press would close the line); handles as lines with round ends; the next
 * curve to the pointer, dashed; and the guides an anchor has snapped to. On
 * touch everything bigger – a finger has to find it. It never takes a
 * pointer.
 */
export const LineMarks = ({
  marks,
  lines,
  touch,
  view,
  className,
}: {
  marks: LineMarking | null;
  lines: Guides | null;
  touch: boolean;
  /** How the drawing is zoomed and moved – the marks keep their size. */
  view?: ViewLike;
  className?: string;
}) => {
  const [box, size] = useSide();
  const px = toPx(size, view, "x");
  const py = toPx(size, view, "y");
  const half = touch ? 7 : 4;
  const at = (x: number, y: number) =>
    `${px(x).toFixed(1)} ${py(y).toFixed(1)}`;
  const anchors = marks?.anchors ?? [];
  const count = anchorCount(anchors);
  const shows = (i: number) =>
    marks?.handles === "all" || (marks?.handles === "last" && i === count - 1);
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none", className)}
      ref={box}
    >
      {size > 0 && (
        <svg
          aria-hidden="true"
          className="h-full w-full overflow-visible"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox={`0 0 ${size} ${size}`}
        >
          {lines && <GuideLines lines={lines} px={px} py={py} size={size} />}
          {marks && marks.line.length >= 4 && (
            <Line
              d={strokePath(marks.line.map((v, i) => (i % 2 ? py(v) : px(v))))}
            />
          )}
          {marks?.preview && (
            <Line
              d={`M${at(marks.preview[0], marks.preview[1])}C${at(marks.preview[2], marks.preview[3])} ${at(marks.preview[4], marks.preview[5])} ${at(marks.preview[6], marks.preview[7])}`}
              dashed
            />
          )}
          {Array.from({ length: count }, (_, i) => i).map((i) => {
            const k = i * ANCHOR;
            return (["in", "out"] as const).map((side) => {
              if (!shows(i) || noHandle(anchors, i, side)) return null;
              const h = k + (side === "in" ? 2 : 4);
              return (
                <g key={`${i}-${side}`}>
                  <Line
                    d={`M${at(anchors[k], anchors[k + 1])}L${at(anchors[h], anchors[h + 1])}`}
                  />
                  <circle
                    cx={px(anchors[h])}
                    cy={py(anchors[h + 1])}
                    fill="white"
                    r={half - 1}
                    stroke="var(--color-ink)"
                    strokeWidth={1.5}
                  />
                </g>
              );
            });
          })}
          {Array.from({ length: count }, (_, i) => i).map((i) => {
            const x = px(anchors[i * ANCHOR]);
            const y = py(anchors[i * ANCHOR + 1]);
            return (
              <g key={i}>
                {((marks?.closing && i === 0) || marks?.picked === i) && (
                  <circle
                    cx={x}
                    cy={y}
                    r={half + 5}
                    stroke="white"
                    strokeOpacity={0.8}
                    strokeWidth={4.5}
                  />
                )}
                {((marks?.closing && i === 0) || marks?.picked === i) && (
                  <circle
                    cx={x}
                    cy={y}
                    r={half + 5}
                    stroke="var(--color-ink)"
                    strokeWidth={marks?.picked === i ? 2.5 : 1.5}
                  />
                )}
                <rect
                  fill={marks?.picked === i ? "var(--color-ink)" : "white"}
                  height={half * 2}
                  stroke="var(--color-ink)"
                  strokeWidth={1.5}
                  width={half * 2}
                  x={x - half}
                  y={y - half}
                />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
};
