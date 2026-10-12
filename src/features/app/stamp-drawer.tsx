"use client";

import { type PointerEvent, useMemo, useRef, useState } from "react";
import { Sparkle } from "@/components/doodles";
import { Button, Field, Notice } from "@/components/ui";
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
import { StickerView } from "@/features/stickers/sticker-view";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { Sheet } from "./sheet";

/** Line width of a drawn stroke, relative to the stamp. */
const WIDTH = 0.05;
/** Points closer than this to the last one are left out. */
const MIN_STEP = 0.006;

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Making a stamp: pick its body – circle or square (it morphs) – and a color
 * (it fades), doodle onto it, and when done it turns 3D: a sticker to stamp
 * with, as often as you like. Saved on the device at once, synced later.
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
  const [step, setStep] = useState<"draw" | "3d">("draw");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [shape, setShape] = useState<StampShape>("circle");
  const [color, setColor] = useState<ColorName>("grape");
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState(false);
  const drawing = useRef(false);

  const sticker = useMemo(
    () => ({ shape, color, drawing: { strokes } }),
    [shape, color, strokes]
  );

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

  const stop = () => {
    drawing.current = false;
  };

  const onSave = async () => {
    setError(false);
    try {
      await createStamp({
        name: name.trim().slice(0, 40),
        color,
        shape,
        drawing: { v: 1, strokes },
        calendar: shared ? calendar : null,
      });
      trackEvent("stamp-created");
      onClose();
    } catch {
      setError(true);
    }
  };

  if (step === "3d") {
    return (
      <Sheet onClose={onClose} title={t.app.draw.done}>
        <div className="relative mx-auto w-full max-w-80">
          <Sparkle className="absolute top-2 left-0 h-7 w-7 animate-boop text-sun [animation-delay:700ms]" />
          <Sparkle className="absolute right-2 bottom-6 h-5 w-5 animate-boop text-pink [animation-delay:850ms]" />
          <StickerView stamp={sticker} />
        </div>
        <p className="-mt-2 text-center text-muted text-sm">
          {t.app.draw.turn}
        </p>
        <Field
          label={t.app.draw.name}
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
          placeholder={t.app.draw.namePlaceholder}
          value={name}
        />
        {calendar && (
          <label className="flex items-center gap-3 font-medium text-sm">
            <input
              checked={shared}
              className="h-5 w-5 accent-violet"
              onChange={(event) => setShared(event.target.checked)}
              type="checkbox"
            />
            {t.app.draw.shared}
          </label>
        )}
        {error && <Notice tone="error">{t.auth.failed}</Notice>}
        <div className="flex justify-between gap-2">
          <Button onClick={() => setStep("draw")} variant="plain">
            ← {t.app.draw.back}
          </Button>
          <Button onClick={onSave}>{t.app.draw.save}</Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose} title={t.app.draw.title}>
      <div className="flex items-center justify-between gap-2">
        <fieldset className="flex gap-2">
          <legend className="sr-only">{t.app.draw.shape}</legend>
          {SHAPES.map((s) => (
            <button
              aria-label={t.app.draw.shapes[s]}
              aria-pressed={shape === s}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-ink p-2 transition",
                shape === s ? "bg-ink text-white" : "bg-card hover:bg-soft"
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
                  strokeWidth="0.1"
                />
              </svg>
            </button>
          ))}
        </fieldset>
        <div className="flex gap-1">
          <Button
            disabled={!strokes.length}
            onClick={() => setStrokes((all) => all.slice(0, -1))}
            size="sm"
            variant="ghost"
          >
            ↶ {t.app.draw.undo}
          </Button>
          <Button
            disabled={!strokes.length}
            onClick={() => setStrokes([])}
            size="sm"
            variant="ghost"
          >
            {t.app.draw.clear}
          </Button>
        </div>
      </div>

      <div
        aria-label={t.app.draw.hint}
        className="relative aspect-square w-full cursor-crosshair touch-none rounded-3xl bg-soft bg-[radial-gradient(var(--color-line)_1.3px,transparent_1.3px)] bg-size-[18px_18px] p-3"
        onPointerCancel={stop}
        onPointerDown={onDown}
        onPointerLeave={stop}
        onPointerMove={onMove}
        onPointerUp={stop}
        ref={area}
        role="application"
      >
        <StampSvg
          className="pointer-events-none h-full w-full"
          color={color}
          drawing={strokes.length ? { strokes } : null}
          filled
          shape={shape}
        />
        {!strokes.length && (
          <p className="pointer-events-none absolute inset-0 flex animate-fade items-center justify-center font-bold text-muted">
            {t.app.draw.hint}
          </p>
        )}
      </div>

      <fieldset className="flex flex-wrap items-center justify-center gap-2.5">
        <legend className="sr-only">{t.app.draw.color}</legend>
        {COLOR_NAMES.map((c) => (
          <button
            aria-label={t.colors[c]}
            aria-pressed={color === c}
            className={cn(
              "h-9 w-9 rounded-full border-2 border-ink transition-transform duration-200",
              color === c ? "scale-125 shadow-sticker-sm" : "hover:scale-110"
            )}
            key={c}
            onClick={() => setColor(c)}
            style={{ background: COLORS[c] }}
            type="button"
          />
        ))}
      </fieldset>

      <Button
        className="w-full"
        disabled={!strokes.length}
        onClick={() => setStep("3d")}
        size="lg"
      >
        {t.app.draw.make3d} <Sparkle className="h-5 w-5" />
      </Button>
    </Sheet>
  );
};
