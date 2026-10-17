import { AnimatePresence } from "motion/react";
import { type PointerEvent, type RefObject, useId, useMemo } from "react";
import { Sparkle } from "@/components/doodles";
import { Notice } from "@/components/ui";
import type { Art } from "@/features/calendar/art";
import type { Guides } from "@/features/calendar/guides";
import type { StampShape } from "@/features/calendar/model";
import { MorphOutline } from "@/features/calendar/morph-outline";
import { hexOf } from "@/features/calendar/palette";
import {
  Glitter,
  type ReadonlyDrawing,
  StampSvg,
} from "@/features/calendar/stamp-svg";
import type { StickerInput } from "@/features/stickers/build";
import { STAGE, StickerView } from "@/features/stickers/sticker-view";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { LineMarks, Marks, type Tool } from "../draw-tools";
import { Loupe, type LoupeHandle } from "../loupe";
import type { useLine } from "../use-line";
import type { useSelect } from "../use-select";
import type { View } from "../use-zoom";
import { Sign } from "./sign";
import { INSET } from "./use-drawing-box";

/**
 * The stage: the drawing on its paper, what the tools mark on it, the pen's
 * tip and the loupe – and, made 3D, the stamp right over it.
 */

/** A magnifier – back to the whole face. */
const WHOLE_SIGN =
  "M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13ZM15.2 15.2 20 20";

type Handler = (event: PointerEvent<HTMLDivElement>) => void;

/**
 * The stage stays where it is: the drawing, then the stamp over it. The
 * drawing is a layer of its own (no mask or clip round it) – what changes
 * repaints there alone.
 */
export const Stage = ({
  locale,
  draws,
  tool,
  area,
  paper,
  tip,
  live,
  liveCopy,
  glitter,
  loupe,
  onDown,
  onMove,
  onUp,
  onLeave,
  art,
  select,
  line,
  dropLines,
  view,
  zoomed,
  onZoomReset,
  shape,
  color,
  doodle,
  inverted,
  special,
  empty,
  refused,
  loupeOn,
  made,
  view3d,
  shown,
  onShown,
}: {
  locale: Locale;
  draws: boolean;
  tool: Tool;
  area: RefObject<HTMLDivElement | null>;
  /** The drawing box on the stage – what zooms. */
  paper: RefObject<HTMLDivElement | null>;
  /** The pen's tip over the stage, pointed at – moved without a render. */
  tip: RefObject<HTMLSpanElement | null>;
  /** The line under way: drawn on a layer of its own (and in the loupe). */
  live: RefObject<SVGPathElement | null>;
  liveCopy: RefObject<SVGPathElement | null>;
  glitter: RefObject<HTMLSpanElement | null>;
  loupe: RefObject<LoupeHandle | null>;
  onDown: Handler;
  onMove: Handler;
  onUp: Handler;
  onLeave: () => void;
  art: Art;
  select: ReturnType<typeof useSelect>;
  line: ReturnType<typeof useLine>;
  /** A template being dragged in – the guides it lies on. */
  dropLines: Guides | null;
  view: View;
  zoomed: boolean;
  onZoomReset: () => void;
  shape: StampShape;
  color: string;
  doodle: ReadonlyDrawing;
  inverted: boolean;
  special: boolean;
  empty: boolean;
  /** An uploaded picture was refused. */
  refused: boolean;
  loupeOn: boolean;
  /** The stamp made 3D – the drawing as it was made into one – and its turn. */
  made: StickerInput | null;
  view3d: number;
  /** Its first frame is on screen: the drawing can fade away under it. */
  shown: boolean;
  onShown: () => void;
}) => {
  const t = dictionaryOf(locale);
  const ink = hexOf(color);
  // The line under way, in the ink – paper on an inverted stamp, where lines
  // are cut out of the inked face.
  const liveInk = inverted ? `color-mix(in srgb, ${ink} 14%, white)` : ink;

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

  return (
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
            art={art}
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
            art={art}
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
          onClick={onZoomReset}
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
            onShown={onShown}
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
};
