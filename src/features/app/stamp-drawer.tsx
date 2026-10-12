"use client";

import {
  type ChangeEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Sparkle } from "@/components/doodles";
import { Button, Field, Notice } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import { importSvg } from "@/features/calendar/import-svg";
import {
  type ColorName,
  type Fill,
  SHAPES,
  type StampShape,
  type Stroke,
} from "@/features/calendar/model";
import { knownKey } from "@/features/calendar/palette";
import { usePalette } from "@/features/calendar/palette-provider";
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
/** The drawing's distance from the stage's edge (px) – `inset-3` below. */
const INSET = 12;
/** How long the drawing and the 3D stamp take to swap (ms). */
const SWAP = 300;
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
/** An arrow turning back – taking the last line away. */
const UNDO = "M8.5 5.5 4 10l4.5 4.5M4 10h10.5a5 5 0 0 1 0 10H11";
/** A little bin – clearing the drawing. */
const BIN =
  "M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5M10.5 10.5v6M13.5 10.5v6";
/** An arrow up out of a tray – uploading a picture. */
const UPLOAD = "M12 15.5V4M7.5 8.5 12 4l4.5 4.5M4.5 15v4.5h15V15";

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
 * like. Saved on the device at once, synced later.
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
  const file = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"draw" | "3d">("draw");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  // An uploaded picture: its filled areas – and how many of the strokes (the
  // first ones) are its lines; what is drawn comes on top.
  const [fills, setFills] = useState<Fill[]>([]);
  const [uploaded, setUploaded] = useState(0);
  const [refused, setRefused] = useState(false);
  // Prints the other way round: the face in ink, the doodle cut out.
  const [inverted, setInverted] = useState(false);
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
  // The 3D view – a new one each time (0: none), kept until it has faded.
  const [view, setView] = useState(0);
  // Its first frame is on screen: the drawing can fade away under it.
  const [shown, setShown] = useState(false);
  const leave = useRef<ReturnType<typeof setTimeout>>(undefined);
  const draws = step === "draw";
  const empty = !(strokes.length || fills.length);

  // three.js loads while drawing – the stamp is quick to appear.
  useEffect(() => {
    void import("three");
    void import("three/examples/jsm/environments/RoomEnvironment.js");
    return () => clearTimeout(leave.current);
  }, []);

  const doodle = useMemo(
    () => ({ strokes, fills, inverted }),
    [strokes, fills, inverted]
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

  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    const p = point(event);
    if (!p) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    setRefused(false);
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

  const clear = () => {
    setStrokes([]);
    setFills([]);
    setUploaded(0);
  };

  // The last line drawn goes – and once none is left, the uploaded picture.
  const undo = () => {
    if (strokes.length > uploaded) setStrokes((all) => all.slice(0, -1));
    else clear();
  };

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
      setStrokes(picture.strokes);
      setFills(picture.fills);
      setUploaded(picture.strokes.length);
    } catch {
      setRefused(true);
    }
  };

  const toStamp = () => {
    stop();
    clearTimeout(leave.current);
    setRefused(false);
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
        drawing: {
          v: 1,
          strokes,
          ...(fills.length > 0 && { fills }),
          ...(inverted && { inverted: true as const }),
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
    <Sheet onClose={onClose} title={draws ? t.app.draw.title : t.app.draw.done}>
      <div className="grid">
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
                className={cn(
                  "flex aspect-square w-full items-center justify-center rounded-xl border-2 border-ink p-1.5 transition",
                  shape === s ? "bg-ink text-white" : "bg-card hover:bg-soft"
                )}
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
          {/* On a phone just the signs – the five shapes need the room. */}
          <div className="flex shrink-0 gap-0.5">
            <Button
              aria-label={t.app.draw.undo}
              className="px-2.5"
              disabled={empty}
              onClick={undo}
              size="sm"
              title={t.app.draw.undo}
              variant="ghost"
            >
              <Sign className="h-5 w-5" d={UNDO} />
              <span className="max-sm:hidden">{t.app.draw.undo}</span>
            </Button>
            <Button
              aria-label={t.app.draw.clear}
              className="px-2.5"
              disabled={empty}
              onClick={clear}
              size="sm"
              title={t.app.draw.clear}
              variant="ghost"
            >
              <Sign className="h-5 w-5" d={BIN} />
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
          <Button
            className="shrink-0"
            onClick={toDrawing}
            size="sm"
            variant="plain"
          >
            ← {t.app.draw.back}
          </Button>
          <p className="min-w-0 text-right font-medium text-muted text-sm leading-tight">
            {t.app.draw.turn}
          </p>
        </div>
      </div>

      {/* The stage stays where it is: the drawing, then the stamp over it. */}
      <div
        aria-label={draws ? t.app.draw.hint : t.app.draw.turn}
        className={cn(STAGE, "touch-none", draws && "cursor-crosshair")}
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
            "pointer-events-none absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] transition-opacity duration-300",
            !draws && shown && "opacity-0"
          )}
          color={color}
          drawing={doodle}
          filled
          shape={shape}
        />
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
        {view > 0 && (
          // Right over the drawing – its first frame looks just like it.
          <StickerView
            className={cn(
              "absolute inset-0 transition-opacity duration-300",
              draws && "pointer-events-none opacity-0"
            )}
            inset={INSET}
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
          className={cn(layer(draws), "flex flex-col justify-between gap-3")}
        >
          <fieldset className="flex flex-wrap items-center justify-center gap-2.5">
            <legend className="sr-only">{t.app.draw.color}</legend>
            {palette.map(({ key: c, hex, name: names }) => (
              <button
                aria-label={names[locale]}
                aria-pressed={color === c}
                className={cn(
                  "h-9 w-9 rounded-full border-2 border-ink transition-transform duration-200",
                  color === c
                    ? "scale-125 shadow-sticker-sm"
                    : "hover:scale-110"
                )}
                key={c}
                onClick={() => setColor(c)}
                style={{ background: hex }}
                type="button"
              />
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <label className="flex items-center gap-2 font-medium text-sm">
              <input
                checked={inverted}
                className="h-5 w-5 accent-ink"
                onChange={(event) => setInverted(event.target.checked)}
                type="checkbox"
              />
              {t.app.draw.inverted}
            </label>
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
            <label className="flex items-center gap-3 font-medium text-sm">
              <input
                checked={shared}
                className="h-5 w-5 shrink-0 accent-violet"
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
