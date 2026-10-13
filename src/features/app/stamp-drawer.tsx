"use client";

import { AnimatePresence } from "motion/react";
import {
  type ChangeEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowLeft, Sparkle } from "@/components/doodles";
import { Button, Checkbox, Field, Notice } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import { importSvg } from "@/features/calendar/import-svg";
import {
  type ColorName,
  type Fill,
  RIMS,
  type RimPattern,
  SHAPES,
  type StampShape,
  type Stroke,
} from "@/features/calendar/model";
import { rimLine } from "@/features/calendar/outline";
import { hexOf, knownKey } from "@/features/calendar/palette";
import { usePalette } from "@/features/calendar/palette-provider";
import { Glitter, ShapeOutline, StampSvg } from "@/features/calendar/stamp-svg";
import { createStamp } from "@/features/offline/store";
import type { StickerInput } from "@/features/stickers/build";
import { STAGE, StickerView } from "@/features/stickers/sticker-view";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { InkBlot } from "./ink-blot";
import { Sheet } from "./sheet";

/** The line widths to draw with, relative to the stamp. */
const WIDTHS = { thin: 0.03, medium: 0.05, thick: 0.085 } as const;
type Width = keyof typeof WIDTHS;
/** How many steps undo reaches back. */
const STEPS_BACK = 100;
/** Points closer than this to the last one are left out. */
const MIN_STEP = 0.006;
/** The drawing's distance from the stage's edge (px) – `inset-3` below. */
const INSET = 12;
/** An uploaded picture may be this big (bytes) – drawings are small. */
const MAX_UPLOAD = 1_000_000;

const round = (n: number) => Math.round(n * 1000) / 1000;

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

/**
 * A shape or a rim to pick: a small scribbled tile, filled with ink when it
 * is the one (`aria-pressed`).
 */
const TILE =
  "scribble scribble-sm flex aspect-square w-full items-center justify-center rounded-xl transition-transform duration-150 ease-out hover:-rotate-6 active:scale-90 aria-pressed:scribble-ink aria-pressed:hover:rotate-0";

/** What is drawn: the lines – and an uploaded picture's filled areas. */
type Art = { strokes: Stroke[]; fills: Fill[] };
const BLANK: Art = { strokes: [], fills: [] };

/**
 * Every step of the drawing (a line, a picture, clearing) can be taken back
 * and done again: the ones before `now` and the ones taken back after it.
 */
type History = { past: Art[]; now: Art; future: Art[] };

/** A new step – what was taken back is gone then. */
const step = (history: History, next: (now: Art) => Art): History => ({
  past: [...history.past, history.now].slice(-STEPS_BACK),
  now: next(history.now),
  future: [],
});

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

/**
 * Two sets of controls in one place, one of them showing: one fades away,
 * then the other comes, and the taller one sets the height – so nothing
 * around them moves.
 */
const layer = (on: boolean) =>
  cn(
    "col-start-1 row-start-1 min-w-0 transition-[opacity,visibility] duration-200",
    on ? "delay-150" : "invisible opacity-0"
  );

/**
 * Making a stamp: pick its body (it morphs from shape to shape) and a color
 * (it fades), doodle onto it – or upload a picture (SVG) and draw on – and
 * when done the drawing turns into the stamp right where it is: a 3D rubber
 * stamp to look at from every side, then to stamp with, as often as you
 * like. Back to drawing, the stamp flies back onto its drawing the way it
 * came. Saved on the device at once, synced later.
 */
export const StampDrawer = ({
  calendar,
  locale,
  onClose,
}: {
  /**
   * The calendar it is drawn in, if its members may get to stamp with it too
   * – null when nobody else is in it. The stamp is its maker's either way.
   */
  calendar: string | null;
  locale: Locale;
  onClose: () => void;
}) => {
  const t = dictionaryOf(locale);
  const area = useRef<HTMLDivElement>(null);
  // The pen's tip over the stage, pointed at – moved without a render.
  const tip = useRef<HTMLSpanElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"draw" | "3d">("draw");
  const [history, setHistory] = useState<History>({
    past: [],
    now: BLANK,
    future: [],
  });
  const { strokes, fills } = history.now;
  const [width, setWidth] = useState<Width>("medium");
  const [refused, setRefused] = useState(false);
  // Prints the other way round: the face in ink, the doodle cut out.
  const [inverted, setInverted] = useState(false);
  // The rim's pattern (none: plain), and whether it is for the big days.
  const [rim, setRim] = useState<RimPattern | undefined>(undefined);
  const [special, setSpecial] = useState(false);
  const [shape, setShape] = useState<StampShape>("circle");
  // Its color: one of the stamp colors – the one picked as long as the
  // palette has it; else, and to begin with, “grape” or the palette's first.
  const palette = usePalette();
  const [picked, setColor] = useState<ColorName>("grape");
  const color = knownKey(picked, palette);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState(false);
  const drawing = useRef(false);
  // The 3D view – a new one each time, counted – and the stamp it shows: the
  // drawing as it was made into one.
  const [view, setView] = useState(0);
  const [made, setMade] = useState<StickerInput | null>(null);
  // Its first frame is on screen: the drawing can fade away under it.
  const [shown, setShown] = useState(false);
  const draws = stage === "draw";
  const empty = !(strokes.length || fills.length);

  // three.js loads while drawing – the stamp is quick to appear.
  useEffect(() => {
    void import("three");
  }, []);

  // ⌘Z / Ctrl+Z a step back, with Shift (or Ctrl+Y) forward again – while
  // drawing, and not in a text field.
  useEffect(() => {
    if (!draws) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if ((event.target as HTMLElement | null)?.closest("input, textarea")) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "z") setHistory(event.shiftKey ? forward : back);
      else if (key === "y") setHistory(forward);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draws]);

  const doodle = useMemo(
    () => ({ strokes, fills, inverted, rim, special }),
    [strokes, fills, inverted, rim, special]
  );
  const sticker = useMemo(
    () => ({ shape, color, drawing: doodle }),
    [shape, color, doodle]
  );

  // The drawing sits a little inside the stage, and its view box reaches a
  // little beyond the unit square (its rim).
  const point = (event: PointerEvent) => {
    const box = area.current?.getBoundingClientRect();
    if (!box) return null;
    const at = (offset: number, size: number) =>
      round(
        Math.min(
          Math.max(-0.02 + (1.04 * (offset - INSET)) / (size - 2 * INSET), 0),
          1
        )
      );
    return [
      at(event.clientX - box.left, box.width),
      at(event.clientY - box.top, box.height),
    ] as const;
  };

  /**
   * The pen's tip where the line would go – as wide as it draws, in the
   * stamp's ink (paper on an inverted stamp, where lines are cut out). Kept
   * on the drawing as the line is (`point`); nothing for a finger, which
   * covers it anyway.
   */
  const showTip = (event: PointerEvent<HTMLDivElement>) => {
    const el = tip.current;
    const box = area.current?.getBoundingClientRect();
    const p = point(event);
    if (!(el && box && p)) return;
    if (event.pointerType === "touch") {
      el.style.opacity = "0";
      return;
    }
    const at = (u: number, size: number) =>
      INSET + ((u + 0.02) * (size - 2 * INSET)) / 1.04;
    el.style.transform = `translate(${at(p[0], box.width)}px, ${at(p[1], box.height)}px) translate(-50%, -50%)`;
    el.style.opacity = "1";
  };

  const hideTip = () => {
    if (tip.current) tip.current.style.opacity = "0";
  };

  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    showTip(event);
    const p = point(event);
    if (!p) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    setRefused(false);
    setHistory((history) =>
      step(history, (now) => ({
        ...now,
        strokes: [...now.strokes, { w: WIDTHS[width], p: [...p] }],
      }))
    );
  };

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    showTip(event);
    if (!drawing.current) return;
    const p = point(event);
    if (!p) return;
    // The line being drawn grows – still the same step.
    setHistory((history) => {
      const all = history.now.strokes;
      const last = all.at(-1);
      if (!last) return history;
      const lx = last.p[last.p.length - 2];
      const ly = last.p[last.p.length - 1];
      if (Math.hypot(p[0] - lx, p[1] - ly) < MIN_STEP) return history;
      return {
        ...history,
        now: {
          ...history.now,
          strokes: [...all.slice(0, -1), { ...last, p: [...last.p, ...p] }],
        },
      };
    });
  };

  const stop = () => {
    drawing.current = false;
  };

  // A step of its own – it can be taken back, too.
  const clear = () => setHistory((history) => step(history, () => BLANK));

  // A picture takes the place of what was there – then it is drawn on.
  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    // The same file can be picked again.
    event.target.value = "";
    if (!picked) return;
    setRefused(false);
    try {
      if (picked.size > MAX_UPLOAD) throw new Error("too big");
      const picture = await importSvg(await picked.text());
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

  const toStamp = () => {
    stop();
    setRefused(false);
    setShown(false);
    setMade(sticker);
    setView((n) => n + 1);
    setStage("3d");
  };

  // The drawing comes back under the stamp, which flies onto it and fades
  // (out of its presence, it stays until it has landed).
  const toDrawing = () => {
    setStage("draw");
    setShown(false);
  };

  const onSave = async () => {
    setError(false);
    try {
      await createStamp({
        name: name.trim().slice(0, 40),
        color,
        shape,
        drawing: {
          v: 1,
          strokes,
          ...(fills.length > 0 && { fills }),
          ...(inverted && { inverted: true as const }),
          ...(rim && { rim }),
          ...(special && { special: true as const }),
        },
        sharedWith: shared && calendar ? [calendar] : [],
      });
      trackEvent("stamp-created");
      onClose();
    } catch {
      setError(true);
    }
  };

  return (
    <Sheet
      className="md:max-w-3xl"
      onClose={onClose}
      title={draws ? t.app.draw.title : t.app.draw.done}
    >
      {/* On a phone one under the other. Wider, side by side – the stage on
          the left, everything to set beside it – so nothing needs scrolling. */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_19.5rem] md:items-start md:gap-x-6">
        <div className="grid md:col-start-2 md:row-start-1">
          <div
            className={cn(
              layer(draws),
              "flex h-11 items-center justify-between gap-2"
            )}
          >
            {/* Five in a row – narrower where the phone is. */}
            <fieldset className="grid max-w-56 min-w-0 flex-1 grid-cols-5 gap-1.5">
              <legend className="sr-only">{t.app.draw.shape}</legend>
              {SHAPES.map((s) => (
                <button
                  aria-label={t.app.draw.shapes[s]}
                  aria-pressed={shape === s}
                  className={cn(TILE, "p-1.5")}
                  key={s}
                  onClick={() => setShape(s)}
                  title={t.app.draw.shapes[s]}
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
            </fieldset>
          </div>
          <div
            className={cn(
              layer(!draws),
              "flex h-11 items-center justify-between gap-2"
            )}
          >
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
        </div>

        {/* The stage stays where it is: the drawing, then the stamp over it. */}
        <div
          aria-label={draws ? t.app.draw.hint : t.app.draw.turn}
          className={cn(
            STAGE,
            "touch-none md:col-start-1 md:row-span-2 md:row-start-1",
            // The tip shows where the pen is – no arrow on top of it.
            draws && "cursor-none"
          )}
          onPointerCancel={draws ? stop : undefined}
          onPointerDown={draws ? onDown : undefined}
          onPointerLeave={
            draws
              ? () => {
                  stop();
                  hideTip();
                }
              : undefined
          }
          onPointerMove={draws ? onMove : undefined}
          onPointerUp={draws ? stop : undefined}
          ref={area}
          role="application"
        >
          <StampSvg
            className={cn(
              "pointer-events-none absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] transition-opacity duration-300",
              !draws && shown && "opacity-0"
            )}
            color={color}
            drawing={doodle}
            filled
            shape={shape}
          />
          {draws && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-0 left-0 aspect-square rounded-full opacity-0 ring-1 ring-ink/50 transition-opacity duration-100"
              ref={tip}
              style={{
                width: `calc((100% - ${2 * INSET}px) * ${WIDTHS[width] / 1.04})`,
                background: inverted ? "#ffffff" : hexOf(color),
              }}
            />
          )}
          {draws && special && !empty && (
            // A taste of what its prints will do.
            <span className="pointer-events-none absolute inset-3 animate-fade">
              <Glitter
                color={color}
                drawing={doodle}
                shape={shape}
                sheen={false}
              />
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
          <AnimatePresence>
            {!draws && made && (
              // Right over the drawing – its first frame looks just like it,
              // and so does its last.
              <StickerView
                className="absolute inset-0"
                flyBack
                inset={INSET}
                key={view}
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

        <div className="grid md:col-start-2 md:row-start-2">
          <div
            className={cn(layer(draws), "flex flex-col justify-between gap-3")}
          >
            {/* Right under the drawing: how thick the pen is, and the steps
              back and forth. */}
            <div className="flex items-center justify-between gap-2">
              <fieldset className="flex gap-1.5">
                <legend className="sr-only">{t.app.draw.width}</legend>
                {(Object.keys(WIDTHS) as Width[]).map((w) => (
                  <button
                    aria-label={t.app.draw.widths[w]}
                    aria-pressed={width === w}
                    className={cn(TILE, "w-10")}
                    key={w}
                    onClick={() => setWidth(w)}
                    title={t.app.draw.widths[w]}
                    type="button"
                  >
                    {/* The pen's tip, as big as it draws on a 160px stamp. */}
                    <svg
                      aria-hidden="true"
                      className="w-full"
                      viewBox="0 0 1 1"
                    >
                      <circle
                        cx="0.5"
                        cy="0.5"
                        fill="currentColor"
                        r={WIDTHS[w] * 2.4}
                      />
                    </svg>
                  </button>
                ))}
              </fieldset>
              <div className="flex shrink-0 gap-0.5">
                {[
                  {
                    label: t.app.draw.undo,
                    sign: UNDO,
                    off: !history.past.length,
                    go: () => setHistory(back),
                  },
                  {
                    label: t.app.draw.redo,
                    sign: REDO,
                    off: !history.future.length,
                    go: () => setHistory(forward),
                  },
                  { label: t.app.draw.clear, sign: BIN, off: empty, go: clear },
                ].map(({ label, sign, off, go }) => (
                  <Button
                    aria-label={label}
                    className="px-2.5"
                    disabled={off}
                    key={label}
                    onClick={go}
                    size="sm"
                    title={label}
                    variant="ghost"
                  >
                    <Sign className="h-5 w-5" d={sign} />
                  </Button>
                ))}
              </div>
            </div>
            {/* Blots of the stamp colors, the one picked ringed – like the
              day's stamp pads. */}
            <fieldset className="flex flex-wrap items-center justify-center gap-1">
              <legend className="sr-only">{t.app.draw.color}</legend>
              {palette.map(({ key: c, hex, name: names }, i) => (
                <button
                  aria-label={names[locale]}
                  aria-pressed={color === c}
                  className={cn(
                    "relative flex h-10 w-10 items-center justify-center rounded-full transition-transform",
                    color === c
                      ? "scale-110"
                      : "hover:-rotate-6 hover:scale-110"
                  )}
                  key={c}
                  onClick={() => setColor(c)}
                  type="button"
                >
                  <InkBlot hex={hex} index={i} on={color === c} />
                </button>
              ))}
            </fieldset>
            {/* The rim's patterns, each on the shape picked – seven in a row. */}
            <fieldset className="mx-auto grid w-full max-w-72 grid-cols-7 gap-1.5">
              <legend className="sr-only">{t.app.draw.rim}</legend>
              {[undefined, ...RIMS].map((r) => {
                // The pattern bigger, so it shows on a button – its line a
                // little finer than that.
                const line = rimLine(shape, r, { scale: 3.5 });
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
                        d={line.d}
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap={line.cap}
                        strokeLinejoin="round"
                        strokeWidth={line.width * 0.85}
                      />
                    </svg>
                  </button>
                );
              })}
            </fieldset>
            {/* The two boxes in one line – on a phone too. */}
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
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
            <div className="flex justify-center">
              <Button
                onClick={() => file.current?.click()}
                size="sm"
                variant="ghost"
              >
                <Sign className="h-4 w-4" d={UPLOAD} /> {t.app.draw.upload}
              </Button>
              <input
                accept=".svg,image/svg+xml"
                hidden
                onChange={onUpload}
                ref={file}
                type="file"
              />
            </div>
            <Button
              className="w-full"
              disabled={empty}
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
              <Checkbox
                checked={shared}
                onChange={(event) => setShared(event.target.checked)}
              >
                {t.app.draw.shared}
              </Checkbox>
            )}
            {error && <Notice tone="error">{t.auth.failed}</Notice>}
            <Button className="w-full" onClick={onSave} size="lg">
              {t.app.draw.save}
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
};
