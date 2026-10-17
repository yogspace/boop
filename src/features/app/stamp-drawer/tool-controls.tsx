import { Button } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import {
  DONE_SIGN,
  REMOVE_SIGN,
  TOOL_KEYS,
  TOOL_SIGNS,
  TOOLS,
  type Tool,
} from "../draw-tools";
import type { useLine } from "../use-line";
import type { useSelect } from "../use-select";
import { Sign, TILE } from "./sign";
import { ERASERS, WIDTHS, type Width } from "./widths";

/** The drawing tools' controls: which tool, how wide, how it goes. */

type Select = ReturnType<typeof useSelect>;
type Line = ReturnType<typeof useLine>;

/** The tools – the steps back and forth lie under the drawing. */
export const ToolPicker = ({
  locale,
  tool,
  onChoose,
}: {
  locale: Locale;
  tool: Tool;
  onChoose: (tool: Tool) => void;
}) => {
  const t = dictionaryOf(locale);
  return (
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
            onClick={() => onChoose(each)}
            title={`${label} (${TOOL_KEYS[each]})`}
            type="button"
          >
            <Sign className="w-full" d={TOOL_SIGNS[each]} />
          </button>
        );
      })}
    </fieldset>
  );
};

/**
 * How thick the pen, the line or the eraser is – or, picking, the picked
 * lines (none pressed when they differ), editing points, that line; and
 * what the tool has to finish or remove.
 */
export const WidthPicker = ({
  locale,
  tool,
  width,
  onWidth,
  select,
  line,
  anchored,
  onEditPoints,
  onLeavePoints,
  boxSize,
  scale,
}: {
  locale: Locale;
  tool: Tool;
  width: Width;
  onWidth: (width: Width) => void;
  select: Select;
  line: Line;
  /** The one line with anchors that is picked – its points can be edited. */
  anchored: number | null;
  onEditPoints: () => void;
  onLeavePoints: (stroke: number | null) => void;
  /** The drawing box's size (px), and how far it is zoomed in. */
  boxSize: number;
  scale: number;
}) => {
  const t = dictionaryOf(locale);
  // The size a width draws at on screen – its dot on the button.
  const dotOf = (w: number) =>
    Math.min(32, Math.max(1.5, (w * boxSize * scale) / 1.04));
  return (
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
                    : onWidth(w)
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
            onClick={onEditPoints}
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
              tool === "line" ? line.finish() : onLeavePoints(line.editing)
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
};

/**
 * A line on how the tool goes – keys with a keyboard, gestures on touch –
 * and for a line's points, round or corner.
 */
export const ToolHint = ({
  locale,
  tool,
  touch,
  line,
}: {
  locale: Locale;
  tool: Tool;
  /** Fingers, not a mouse – the hints for touch (use-select.ts `knob`). */
  touch: boolean;
  line: Line;
}) => {
  const t = dictionaryOf(locale);
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
  return (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <p className="min-w-0 flex-1 text-muted text-xs leading-snug">
        {
          {
            pen: touch ? t.app.draw.penHintTouch : t.app.draw.penHint,
            line: touch ? t.app.draw.lineHintTouch : t.app.draw.lineHint,
            eraser: t.app.draw.eraserHint,
            move: touch ? t.app.draw.moveHintTouch : t.app.draw.moveHint,
            points: touch ? t.app.draw.pointsHintTouch : t.app.draw.pointsHint,
          }[tool]
        }
      </p>
      {kindEl}
    </div>
  );
};
