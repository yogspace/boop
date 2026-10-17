import { memo } from "react";
import { Checkbox } from "@/components/ui";
import {
  RIMS,
  type RimPattern,
  type StampShape,
} from "@/features/calendar/model";
import { rimLine } from "@/features/calendar/outline";
import type { StampColor } from "@/features/calendar/palette";
import type { StampShapeDef } from "@/features/calendar/shapes";
import { ShapeOutline } from "@/features/calendar/stamp-svg";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { FADING, useFadingEdges } from "../fading-edges";
import { InkBlot } from "../ink-blot";
import { TILE } from "./sign";

/**
 * How the stamp looks besides its drawing: shape, color, rim, flags. Each
 * drawn again only when what it shows changes – not as the drawing does.
 */

/**
 * The shapes – they morph into each other. Side by side in two rows; on a
 * phone in one, swiped along (its edges fade where it goes on), so the
 * tools stay near the drawing.
 */
export const ShapePicker = memo(function ShapePicker({
  locale,
  side,
  shapes,
  shape,
  onPick,
}: {
  locale: Locale;
  side: boolean;
  shapes: readonly StampShapeDef[];
  shape: StampShape;
  onPick: (shape: StampShape) => void;
}) {
  const t = dictionaryOf(locale);
  const shapeRow = useFadingEdges("x");
  return (
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
            onClick={() => onPick(s)}
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
});

/**
 * Blots of the stamp colors, the one picked ringed – like the day's stamp
 * pads. On a phone one row, never two: what doesn't fit is swiped to, and
 * fades where it goes on – room all round inside for a blot's ring and
 * lift. Wider, they wrap.
 */
export const ColorPicker = memo(function ColorPicker({
  locale,
  palette,
  color,
  onPick,
}: {
  locale: Locale;
  palette: readonly StampColor[];
  color: string;
  onPick: (color: string) => void;
}) {
  const t = dictionaryOf(locale);
  const colorRow = useFadingEdges("x");
  return (
    <fieldset className="flex min-w-0 flex-col">
      <legend className="mb-1.5 font-bold text-sm">{t.app.draw.color}</legend>
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
            onClick={() => onPick(c)}
            title={names[locale]}
            type="button"
          >
            <InkBlot hex={hex} index={i} on={color === c} />
          </button>
        ))}
      </div>
    </fieldset>
  );
});

/** The rim's patterns, each on the shape picked – seven in a row. */
export const RimPicker = memo(function RimPicker({
  locale,
  shape,
  rim,
  onPick,
}: {
  locale: Locale;
  shape: StampShape;
  rim: RimPattern | undefined;
  onPick: (rim: RimPattern | undefined) => void;
}) {
  const t = dictionaryOf(locale);
  return (
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
              onClick={() => onPick(r)}
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
});

/**
 * Printing the other way round, glittering on the big days – the two boxes
 * in one line, on a phone too.
 */
export const Flags = memo(function Flags({
  locale,
  inverted,
  onInverted,
  special,
  onSpecial,
}: {
  locale: Locale;
  inverted: boolean;
  onInverted: (inverted: boolean) => void;
  special: boolean;
  onSpecial: (special: boolean) => void;
}) {
  const t = dictionaryOf(locale);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      <Checkbox
        checked={inverted}
        onChange={(event) => onInverted(event.target.checked)}
      >
        {t.app.draw.inverted}
      </Checkbox>
      <Checkbox
        checked={special}
        onChange={(event) => onSpecial(event.target.checked)}
      >
        {t.app.draw.special}
      </Checkbox>
    </div>
  );
});
