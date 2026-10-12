"use client";

import { type PointerEvent, useRef, useState } from "react";
import { Button, Field } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import {
  COLOR_NAMES,
  COLORS,
  type ColorName,
  SHAPES,
  type StampShape,
  type Stroke,
} from "@/features/calendar/model";
import { ShapeOutline, StampSvg } from "@/features/calendar/stamp-svg";
import { createStamp } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { Sheet } from "./sheet";

/** Line width of a drawn stroke, relative to the stamp. */
const WIDTH = 0.045;
/** Points closer than this to the last one are left out. */
const MIN_STEP = 0.006;

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Drawing a stamp: pick its body (circle or square), doodle onto it in one
 * color, name it if you like. Saved on the device at once – synced later.
 */
export const StampDrawer = ({
  calendar,
  locale,
  onClose,
}: {
  /** A shared calendar the stamp may belong to – null in the personal one. */
  calendar: string | null;
  locale: Locale;
  onClose: () => void;
}) => {
  const t = dictionaryOf(locale);
  const area = useRef<HTMLDivElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [shape, setShape] = useState<StampShape>("circle");
  const [color, setColor] = useState<ColorName>("coral");
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const drawing = useRef(false);

  // The stamp's view box reaches a little beyond the unit square (its rim).
  const point = (event: PointerEvent) => {
    const box = area.current?.getBoundingClientRect();
    if (!box) return null;
    const at = (offset: number, size: number) =>
      round(Math.min(Math.max(-0.02 + (1.04 * offset) / size, 0), 1));
    return [
      at(event.clientX - box.left, box.width),
      at(event.clientY - box.top, box.height),
    ] as const;
  };

  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    const p = point(event);
    if (!p) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    setStrokes((all) => [...all, { w: WIDTH, p: [...p] }]);
  };

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drawing.current) return;
    const p = point(event);
    if (!p) return;
    setStrokes((all) => {
      const last = all.at(-1);
      if (!last) return all;
      const lx = last.p[last.p.length - 2];
      const ly = last.p[last.p.length - 1];
      if (Math.hypot(p[0] - lx, p[1] - ly) < MIN_STEP) return all;
      return [...all.slice(0, -1), { ...last, p: [...last.p, ...p] }];
    });
  };

  const onSave = async () => {
    await createStamp({
      name: name.trim().slice(0, 40),
      color,
      shape,
      drawing: { v: 1, strokes },
      calendar: shared ? calendar : null,
    });
    trackEvent("stamp-created");
    onClose();
  };

  return (
    <Sheet onClose={onClose} title={t.app.draw.title}>
      <div className="flex gap-2">
        {SHAPES.map((s) => (
          <button
            aria-pressed={shape === s}
            className={cn(
              "h-11 w-11 rounded-xl border-2 border-ink p-1.5",
              shape === s ? "bg-sun" : "bg-card"
            )}
            key={s}
            onClick={() => setShape(s)}
            type="button"
          >
            <svg aria-hidden="true" viewBox="-0.05 -0.05 1.1 1.1">
              <ShapeOutline
                fill="none"
                shape={s}
                stroke="currentColor"
                strokeWidth="0.08"
              />
            </svg>
          </button>
        ))}
      </div>

      <div
        aria-label={t.app.draw.hint}
        className="aspect-square w-full cursor-crosshair touch-none rounded-2xl bg-paper"
        onPointerCancel={() => {
          drawing.current = false;
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => {
          drawing.current = false;
        }}
        ref={area}
        role="application"
      >
        <StampSvg
          className="pointer-events-none h-full w-full"
          color={color}
          drawing={strokes.length ? { strokes } : null}
          shape={shape}
        />
      </div>
      <p className="-mt-2 text-muted text-xs">{t.app.draw.hint}</p>

      <div className="flex flex-wrap items-center gap-2">
        {COLOR_NAMES.map((c) => (
          <button
            aria-label={t.colors[c]}
            aria-pressed={color === c}
            className={cn(
              "h-8 w-8 rounded-full border-2 border-ink",
              color === c && "ring-2 ring-ink ring-offset-2 ring-offset-card"
            )}
            key={c}
            onClick={() => setColor(c)}
            style={{ background: COLORS[c] }}
            type="button"
          />
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          disabled={!strokes.length}
          onClick={() => setStrokes((all) => all.slice(0, -1))}
          variant="plain"
        >
          {t.app.draw.undo}
        </Button>
        <Button
          disabled={!strokes.length}
          onClick={() => setStrokes([])}
          variant="plain"
        >
          {t.app.draw.clear}
        </Button>
      </div>

      <Field
        label={t.app.draw.name}
        maxLength={40}
        onChange={(event) => setName(event.target.value)}
        value={name}
      />
      {calendar && (
        <label className="flex items-center gap-2 text-sm">
          <input
            checked={shared}
            onChange={(event) => setShared(event.target.checked)}
            type="checkbox"
          />
          {t.app.draw.shared}
        </label>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={onClose} variant="quiet">
          {t.app.draw.cancel}
        </Button>
        <Button disabled={!strokes.length} onClick={onSave}>
          {t.app.draw.save}
        </Button>
      </div>
    </Sheet>
  );
};
