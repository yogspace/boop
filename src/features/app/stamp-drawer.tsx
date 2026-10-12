"use client";

import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
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
import { STAGE, StickerView } from "@/features/stickers/sticker-view";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { Sheet } from "./sheet";

/** Line width of a drawn stroke, relative to the stamp. */
const WIDTH = 0.05;
/** Points closer than this to the last one are left out. */
const MIN_STEP = 0.006;
/** How long the drawing and the 3D stamp take to swap (ms). */
const SWAP = 300;

const round = (n: number) => Math.round(n * 1000) / 1000;

/** A little bin – clearing the drawing. */
const Bin = ({ className }: { className?: string }) => (
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
    <path d="M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5M10.5 10.5v6M13.5 10.5v6" />
  </svg>
);

/**
 * Two sets of controls in one place, one of them showing: they cross-fade,
 * and the taller one sets the height – so nothing around them moves.
 */
const layer = (on: boolean) =>
  cn(
    "col-start-1 row-start-1 transition-[opacity,visibility] duration-300",
    !on && "invisible opacity-0"
  );

/**
 * Making a stamp: pick its body – circle or square (it morphs) – and a color
 * (it fades), doodle onto it, and when done the drawing turns into the stamp
 * right where it is – a 3D rubber stamp to look at from every side, then to
 * stamp with, as often as you like. Saved on the device at once, synced
 * later.
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
  // The 3D view – a new one each time (0: none), kept until it has faded.
  const [view, setView] = useState(0);
  // Its first frame is on screen: the drawing can fade away under it.
  const [shown, setShown] = useState(false);
  const leave = useRef<ReturnType<typeof setTimeout>>(undefined);
  const draws = step === "draw";

  // three.js loads while drawing – the stamp is quick to appear.
  useEffect(() => {
    void import("three");
    void import("three/examples/jsm/environments/RoomEnvironment.js");
    return () => clearTimeout(leave.current);
  }, []);

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

  const toStamp = () => {
    stop();
    clearTimeout(leave.current);
    setShown(false);
    setView((n) => n + 1);
    setStep("3d");
  };

  const toDrawing = () => {
    setStep("draw");
    setShown(false);
    leave.current = setTimeout(() => setView(0), SWAP);
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

  return (
    <Sheet onClose={onClose} title={draws ? t.app.draw.title : t.app.draw.done}>
      <div className="grid">
        <div
          className={cn(
            layer(draws),
            "flex h-11 items-center justify-between gap-2"
          )}
        >
          <fieldset className="flex gap-1.5">
            <legend className="sr-only">{t.app.draw.shape}</legend>
            {SHAPES.map((s) => (
              <button
                aria-label={t.app.draw.shapes[s]}
                aria-pressed={shape === s}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink p-1.5 transition",
                  shape === s ? "bg-ink text-white" : "bg-card hover:bg-soft"
                )}
                key={s}
                onClick={() => setShape(s)}
                title={t.app.draw.shapes[s]}
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
          {/* On a phone just the signs – the five shapes need the room. */}
          <div className="flex gap-0.5">
            <Button
              aria-label={t.app.draw.undo}
              className="px-2.5"
              disabled={!strokes.length}
              onClick={() => setStrokes((all) => all.slice(0, -1))}
              size="sm"
              title={t.app.draw.undo}
              variant="ghost"
            >
              ↶<span className="max-sm:hidden">{t.app.draw.undo}</span>
            </Button>
            <Button
              aria-label={t.app.draw.clear}
              className="px-2.5"
              disabled={!strokes.length}
              onClick={() => setStrokes([])}
              size="sm"
              title={t.app.draw.clear}
              variant="ghost"
            >
              <Bin className="h-4 w-4" />
              <span className="max-sm:hidden">{t.app.draw.clear}</span>
            </Button>
          </div>
        </div>
        <div
          className={cn(
            layer(!draws),
            "flex h-11 items-center justify-between gap-2"
          )}
        >
          <Button onClick={toDrawing} size="sm" variant="plain">
            ← {t.app.draw.back}
          </Button>
          <p className="font-medium text-muted text-sm">{t.app.draw.turn}</p>
        </div>
      </div>

      <div
        aria-label={draws ? t.app.draw.hint : t.app.draw.turn}
        className={cn(STAGE, "touch-none p-3", draws && "cursor-crosshair")}
        onPointerCancel={draws ? stop : undefined}
        onPointerDown={draws ? onDown : undefined}
        onPointerLeave={draws ? stop : undefined}
        onPointerMove={draws ? onMove : undefined}
        onPointerUp={draws ? stop : undefined}
        ref={area}
        role="application"
      >
        <StampSvg
          className={cn(
            "pointer-events-none h-full w-full transition-opacity duration-300",
            !draws && shown && "opacity-0"
          )}
          color={color}
          drawing={strokes.length ? { strokes } : null}
          filled
          shape={shape}
        />
        {draws && !strokes.length && (
          <p className="pointer-events-none absolute inset-0 flex animate-fade items-center justify-center font-bold text-muted">
            {t.app.draw.hint}
          </p>
        )}
        {view > 0 && (
          // Right over the drawing – its first frame looks just like it.
          <StickerView
            className={cn(
              "absolute inset-0 transition-opacity duration-300",
              draws && "pointer-events-none opacity-0"
            )}
            inset={12}
            key={view}
            onShown={() => setShown(true)}
            stamp={sticker}
          />
        )}
        {!draws && (
          <>
            <Sparkle className="pointer-events-none absolute -top-3 -left-2 h-7 w-7 animate-boop text-sun [animation-delay:700ms]" />
            <Sparkle className="pointer-events-none absolute -right-2 -bottom-2 h-5 w-5 animate-boop text-pink [animation-delay:850ms]" />
          </>
        )}
      </div>

      <div className="grid">
        <div
          className={cn(layer(draws), "flex flex-col justify-between gap-4")}
        >
          <fieldset className="flex flex-wrap items-center justify-center gap-2.5">
            <legend className="sr-only">{t.app.draw.color}</legend>
            {COLOR_NAMES.map((c) => (
              <button
                aria-label={t.colors[c]}
                aria-pressed={color === c}
                className={cn(
                  "h-9 w-9 rounded-full border-2 border-ink transition-transform duration-200",
                  color === c
                    ? "scale-125 shadow-sticker-sm"
                    : "hover:scale-110"
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
            onClick={toStamp}
            size="lg"
          >
            {t.app.draw.make3d} <Sparkle className="h-5 w-5" />
          </Button>
        </div>
        <div
          className={cn(layer(!draws), "flex flex-col justify-between gap-4")}
        >
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
          <Button className="w-full" onClick={onSave} size="lg">
            {t.app.draw.save}
          </Button>
        </div>
      </div>
    </Sheet>
  );
};
