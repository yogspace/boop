import { useLayoutEffect, useRef, useState } from "react";
import {
  type Frame,
  HANDLES,
  outOfFrame,
  type Selection,
} from "@/features/calendar/arrange";
import type { Art, Box } from "@/features/calendar/art";
import type { Guides } from "@/features/calendar/guides";
import { strokePath } from "@/features/calendar/stamp-svg";
import { cn } from "@/lib/cn";
import { KNOB, type Picked } from "./use-select";

/** The drawing tools: the pen, the eraser, picking and moving. */
export const TOOLS = ["pen", "eraser", "move"] as const;
export type Tool = (typeof TOOLS)[number];

/** Each tool's key – the letter Figma uses (B: its pencil). */
export const TOOL_KEYS: Record<Tool, string> = {
  pen: "B",
  eraser: "E",
  move: "V",
};

/** What each tool's button shows – a small line drawing (24 × 24). */
export const TOOL_SIGNS: Record<Tool, string> = {
  // A pencil, writing down to the left.
  pen: "M4.5 19.5 5.6 15 15.8 4.8a2.1 2.1 0 0 1 3 3L8.6 18l-4.1 1.5ZM14 6.6l3.4 3.4",
  // A rubber, tilted, the line it leaves clean.
  eraser:
    "M13.6 4.6a1.7 1.7 0 0 1 2.4 0l3.4 3.4a1.7 1.7 0 0 1 0 2.4L10.8 19H7.2l-2.8-2.8a1.7 1.7 0 0 1 0-2.4ZM8.6 9.6l5.8 5.8M12 19h8",
  // The pointer.
  move: "M6 3.5v15.2l4-3.8 2.7 6 2.7-1.2-2.7-5.9H18.5Z",
};

/** A dashed box with a cross – taking what is picked away. */
export const REMOVE_SIGN =
  "M4 7.5V4h3.5M10.2 4h3.6M16.5 4H20v3.5M20 10.2v3.6M20 16.5V20h-3.5M13.8 20h-3.6M7.5 20H4v-3.5M4 13.8v-3.6M9.5 9.5l5 5M14.5 9.5l-5 5";

/**
 * The smart guides' color: a clear magenta, like Figma's – apart from the
 * ink of the marks and from every stamp color, on a white edge.
 */
const GUIDE = "#e5007e";

/** A pointer's px from a point on the face (its square, with the rim). */
const toPx = (size: number) => (u: number) => ((u + 0.02) / 1.04) * size;

/** A closed outline through flat pairs. */
const ringPath = (p: readonly number[]) => {
  let d = "";
  for (let i = 0; i + 1 < p.length; i += 2) {
    d += `${i ? "L" : "M"}${p[i].toFixed(1)} ${p[i + 1].toFixed(1)}`;
  }
  return `${d}Z`;
};

/** The outlines of some lines and areas – thin, like Figma's hover. */
const Outlines = ({
  art,
  items,
  px,
}: {
  art: Art;
  items: Selection;
  px: (u: number) => number;
}) => {
  const paths = [
    ...items.fills.flatMap((i) =>
      (art.fills[i]?.p ?? [])
        .filter((ring) => ring.length >= 6)
        .map((ring) => ringPath(ring.map(px)))
    ),
    ...items.strokes.flatMap((i) => {
      const stroke = art.strokes[i];
      return stroke ? [strokePath(stroke.p.map(px))] : [];
    }),
  ].join("");
  return (
    <>
      <path d={paths} stroke="white" strokeOpacity={0.8} strokeWidth={3.5} />
      <path d={paths} stroke="var(--color-ink)" strokeWidth={1.5} />
    </>
  );
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
  className,
}: {
  art: Art;
  hover: Selection | null;
  picked: Picked | null;
  marquee: Box | null;
  lines: Guides | null;
  knob: boolean;
  className?: string;
}) => {
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
  const px = toPx(size);
  const unit = size / 1.04;
  const frame = picked?.frame;
  const corner = (f: Frame, hx: number, hy: number) => {
    const [x, y] = outOfFrame(f, (hx * f.w) / 2, (hy * f.h) / 2);
    return [px(x), px(y)] as const;
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
          {hover && <Outlines art={art} items={hover} px={px} />}
          {picked && <Outlines art={art} items={picked.items} px={px} />}
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
                        d={`M${tx} ${ty}L${px(kx)} ${px(ky)}`}
                        stroke="var(--color-ink)"
                        strokeWidth={2}
                      />
                      <circle
                        cx={px(kx)}
                        cy={px(ky)}
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
                        transform={`translate(${px(kx)} ${px(ky)})`}
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
          {lines &&
            (() => {
              const d = [
                ...lines.x.map((x) => `M${px(x).toFixed(1)} 0V${size}`),
                ...lines.y.map((y) => `M0 ${px(y).toFixed(1)}H${size}`),
              ].join("");
              return (
                <>
                  <path
                    d={d}
                    stroke="white"
                    strokeOpacity={0.8}
                    strokeWidth={3}
                  />
                  <path d={d} stroke={GUIDE} strokeWidth={1} />
                </>
              );
            })()}
          {marquee && (
            <rect
              fill="var(--color-ink)"
              fillOpacity={0.05}
              height={px(marquee.y1) - px(marquee.y0)}
              stroke="var(--color-ink)"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              width={px(marquee.x1) - px(marquee.x0)}
              x={px(marquee.x0)}
              y={px(marquee.y0)}
            />
          )}
        </svg>
      )}
    </div>
  );
};
