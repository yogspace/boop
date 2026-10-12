"use client";

import {
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Snapshot } from "valtio";
import { Circle } from "@/components/doodles";
import { Button } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import {
  type ColorName,
  type DayKey,
  type PlacementDoc,
  type StampDoc,
  todayKey,
} from "@/features/calendar/model";
import { isColorKey, knownKey } from "@/features/calendar/palette";
import { usePalette } from "@/features/calendar/palette-provider";
import { StampSvg } from "@/features/calendar/stamp-svg";
import {
  movePlacement,
  placeStamp,
  removePlacement,
  restorePlacement,
  useBoop,
} from "@/features/offline/store";
import { StampHand, type StampHandle } from "@/features/stickers/stamp-hand";
import { Sticker } from "@/features/stickers/sticker";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { newId } from "@/lib/id";
import { Sheet } from "./sheet";

type Stamp = Snapshot<StampDoc>;
type Print = Snapshot<PlacementDoc>;

/** How far a finger moves before a tap becomes a drag. */
const DRAG = 8;

/** The ink last used on this device. */
const INK_KEY = "boop-ink";

/**
 * A print's width on the page, and how much of the unit square its picture
 * spans (stamp-svg.tsx) – so one unit, the stamp's width, is a quarter page.
 */
const PRINT = 0.26;
const VIEW_BOX = 1.04;

/** How much of the next print's preview shows. */
const GHOST = 0.4;

/** Turning the stamp in hand: degrees per tap on a button or key. */
const STEP = 15;

/** A print's own imperfections, from its id. */
export const seedOf = (id: string) =>
  (Number.parseInt(id.slice(0, 6), 16) || 7) % 997;

/**
 * What can be taken back, newest last. `id` is the print as it is now: one
 * that comes back after a removal is a new one (restorePlacement).
 */
type Step =
  | { kind: "place"; id: string }
  | { kind: "move"; id: string; x: number; y: number; z: number }
  | { kind: "remove"; id: string; print: Print };

const within = (value: number) => Math.min(Math.max(value, 0), 1);

/** An angle as a print keeps it: whole degrees, −180…180. */
const tidy = (degrees: number) => {
  const turned = Math.round(degrees) % 360;
  if (turned > 180) return turned - 360;
  return turned < -180 ? turned + 360 : turned;
};

/**
 * How far a wheel event turns the stamp, in degrees: a notch (about 100 px)
 * is 6°. Small steps count a little more than their share – a trackpad turns
 * it smoothly, a slow wheel still visibly – and none is more than 12°.
 */
const wheelTurn = (event: WheelEvent) => {
  const delta = event.deltaY || event.deltaX;
  // Lines (Firefox) are about 33 px each.
  const px = Math.abs(delta) * (event.deltaMode === 1 ? 33 : 1);
  return Math.sign(delta) * Math.min(12, 0.38 * px ** 0.6);
};

/**
 * An ink blot, drawn by hand a few times over (40 × 40) – the inks take
 * turns, so no two neighbors are the same blot.
 */
const BLOTS = [
  "M20 3c6-1 12 2 15 8 3 5 3 12-1 17-4 6-10 9-17 8-6-1-11-5-13-11C2 18 4 10 9 6c3-2 7-3 11-3Z",
  "M18 4c7-2 15 1 18 7 2 5 1 9-1 14-2 6-6 11-13 12-7 1-14-2-17-8C2 23 3 15 6 10c3-4 7-5 12-6Z",
  "M21 4c5 0 10 2 13 6 4 5 4 11 2 16-2 5-6 9-11 10-3 1-5 0-8 0-6-1-11-4-13-10-2-5-1-12 3-16 4-4 9-6 14-6Z",
  "M19 3c6 0 11 3 14 7 3 5 5 10 3 16-2 6-8 10-14 11-6 0-12-2-15-7C4 25 3 19 5 13 7 7 13 3 19 3Z",
];

/** An ink blot giving way under the stamp. */
const squash = (blot: HTMLElement) => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  blot.animate(
    [
      { transform: "none" },
      { transform: "scale(1.1, 0.86)", offset: 0.3 },
      { transform: "none" },
    ],
    { duration: 280, easing: "ease-out" }
  );
};

/**
 * A day of a calendar: its page with the prints on it, the inks and the tray
 * of stamps. Tap a stamp – it's in your hand (stamp-hand.tsx): small, at the
 * pointer's side, while a faint preview on the page shows the print it will
 * leave; the wheel (or the two buttons, or ← →) turns it. Tap the page – it
 * comes down right there, as previewed; tap an ink – it is pressed onto the
 * blot and takes that ink. With no stamp in hand the prints can be moved,
 * picked and removed. Every step can be taken back.
 */
export const DaySheet = ({
  calendar,
  date,
  locale,
  stamps,
  onClose,
}: {
  calendar: string;
  date: DayKey;
  locale: Locale;
  stamps: readonly Stamp[];
  onClose: () => void;
}) => {
  const t = dictionaryOf(locale);
  const boop = useBoop();
  const page = useRef<HTMLDivElement>(null);
  const hand = useRef<StampHandle>(null);
  // The stamp in hand – with none, the prints can be moved and picked.
  const [held, setHeld] = useState<string | null>(null);
  const inHand = stamps.find((s) => s.id === held) ?? null;
  const holding = Boolean(inHand);
  // The next print: where the stamp is aimed (the page, 0–1), whether its
  // preview shows, and how it is turned – degrees, running on past ±180 so
  // nothing ever spins back the long way. Kept beside React: they change
  // with every move of the pointer.
  const aim = useRef({ x: 0.5, y: 0.5, on: false });
  const turn = useRef(0);
  const ghost = useRef<HTMLDivElement>(null);
  // Its id is made ahead – so the preview is that very print, blot for blot.
  const [next, setNext] = useState(newId);
  const nextId = useRef(next);
  const [picked, setPicked] = useState<string | null>(null);
  // A print being moved – written once it is let go. It keeps where it was
  // taken hold of (`grab`, from its middle).
  const [drag, setDrag] = useState<{
    id: string;
    x: number;
    y: number;
    grab: { x: number; y: number };
    from: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  // A print on its way back after an undo – it glides instead of jumping.
  const [glide, setGlide] = useState<string | null>(null);
  // What was on the page when it opened; anything newer appears like ink.
  const [old] = useState(() => new Set(Object.keys(boop.placements)));

  // One unit on the page in px – pressed, the stamp is exactly that wide.
  const [unit, setUnit] = useState(0);
  useEffect(() => {
    const box = page.current;
    if (!box) return;
    const measure = () => setUnit((box.clientWidth * PRINT) / VIEW_BOX);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // The inks to dip into: the stamp colors. The one in use is the one last
  // chosen – on this device, too – as long as the palette has it; else, and
  // to begin with, “ink” or the palette's first. And a dip of the tray's
  // stamps when it changes.
  const palette = usePalette();
  const [chosen, setInk] = useState<ColorName>("ink");
  const ink = knownKey(chosen, palette);
  const [dip, setDip] = useState(0);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(INK_KEY);
      if (isColorKey(saved)) setInk(saved);
    } catch {
      // No storage – the default ink.
    }
  }, []);
  const chooseInk = (next: ColorName, dipTray = true) => {
    setInk(next);
    if (dipTray) setDip((n) => n + 1);
    try {
      localStorage.setItem(INK_KEY, next);
    } catch {
      // Remembered for this visit only.
    }
  };

  // Undo: the steps of this visit, and a line they queue up in – a step is
  // noted before the next undo looks, also while its print is still saving.
  const steps = useRef<Step[]>([]);
  const line = useRef<Promise<void>>(Promise.resolve());
  const [undoable, setUndoable] = useState(false);
  const note = (step: Step) => {
    line.current = line.current.then(() => {
      steps.current.push(step);
      setUndoable(true);
    });
  };
  const undo = useCallback(() => {
    line.current = line.current
      .then(async () => {
        const step = steps.current.pop();
        setUndoable(steps.current.length > 0);
        if (!step) return;
        if (step.kind === "place") {
          setPicked((id) => (id === step.id ? null : id));
          await removePlacement(step.id);
        } else if (step.kind === "move") {
          setGlide(step.id);
          await movePlacement(step.id, { x: step.x, y: step.y, z: step.z });
        } else {
          // Back as a new print – earlier steps now mean that one.
          const id = await restorePlacement(step.print);
          for (const earlier of steps.current) {
            if (earlier.id === step.id) earlier.id = id;
          }
        }
      })
      .catch(() => undefined);
  }, []);

  /** Puts the preview where the stamp is aimed, turned like it – no render. */
  const preview = useCallback(() => {
    const box = ghost.current;
    const inked = box?.firstElementChild;
    if (!(box && inked instanceof HTMLElement)) return;
    const { x, y, on } = aim.current;
    // In its own widths – the page is 1 / PRINT of them; its middle there.
    const to = (at: number) => `${((at / PRINT) * 100 - 50).toFixed(2)}%`;
    box.style.transform = `translate(${to(x)}, ${to(y)})`;
    inked.style.rotate = `${Math.round(turn.current)}deg`;
    inked.style.opacity = on ? `${GHOST}` : "0";
  }, []);
  useEffect(() => {
    if (holding) preview();
  }, [holding, preview]);

  /** Turns the stamp in hand – its preview turns, the 3D stamp spins along. */
  const turnBy = useCallback(
    (degrees: number) => {
      turn.current += degrees;
      // Turned by button or key, it shows where the stamp was last aimed.
      aim.current.on = true;
      preview();
      hand.current?.turn(Math.round(turn.current));
    },
    [preview]
  );

  /** Takes a stamp into the hand (or puts it down) – straight again. */
  const take = useCallback(
    (id: string | null) => {
      setHeld(id);
      setPicked(null);
      turn.current = 0;
      aim.current.on = false;
      preview();
      hand.current?.turn(0);
    },
    [preview]
  );

  // The wheel turns the stamp in hand, and the sheet doesn't scroll
  // meanwhile – which React's own (passive) wheel listener couldn't stop.
  useEffect(() => {
    const box = page.current;
    if (!(box && holding)) return;
    const onWheel = (event: WheelEvent) => {
      // A pinch (ctrl + wheel) stays the browser's.
      if (event.ctrlKey) return;
      event.preventDefault();
      turnBy(wheelTurn(event));
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [holding, turnBy]);

  // Escape puts the stamp down first – only then it closes the sheet (which
  // listens on the window too, so this one goes ahead of it). ⌘Z / Ctrl+Z
  // takes a step back; ← → and [ ] turn the stamp in hand.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.shiftKey && !event.altKey && event.key === "z") {
        event.preventDefault();
        undo();
        return;
      }
      if (!holding || mod) return;
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        take(null);
      } else if (event.key === "ArrowLeft" || event.key === "[") {
        event.preventDefault();
        turnBy(-STEP);
      } else if (event.key === "ArrowRight" || event.key === "]") {
        event.preventDefault();
        turnBy(STEP);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [holding, take, turnBy, undo]);

  const placements = useMemo(
    () =>
      Object.values(boop.placements)
        .filter((p) => p.calendar === calendar && p.date === date)
        .sort((a, b) => a.z - b.z),
    [boop.placements, calendar, date]
  );

  const title = new Date(`${date}T12:00:00`).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  /**
   * A point on the page (0–1) – also beyond it, for whoever clamps. Inside
   * its border, where the prints are placed: a print lands right under the
   * pointer.
   */
  const onPage = (clientX: number, clientY: number) => {
    const sheet = page.current;
    if (!sheet) return null;
    const box = sheet.getBoundingClientRect();
    return {
      x: (clientX - box.left - sheet.clientLeft) / sheet.clientWidth,
      y: (clientY - box.top - sheet.clientTop) / sheet.clientHeight,
    };
  };

  /**
   * A print of this stamp on the page, as its preview showed it – noted, so
   * it can be taken back. The next print gets a new id (and look).
   */
  const print = (
    stamp: Stamp,
    at: { x: number; y: number },
    rotation: number,
    inked: ColorName
  ) => {
    const id = nextId.current;
    nextId.current = newId();
    setNext(nextId.current);
    note({ kind: "place", id });
    void placeStamp({
      id,
      calendar,
      date,
      stamp: stamp.id,
      ...at,
      rotation,
      ink: inked,
    });
    trackEvent("stamp-placed");
  };

  // Over the page and the inks the stamp in hand keeps to the pointer's
  // side, and on the page the preview goes along under it. A finger doesn't
  // hover: there the stamp goes where it is tapped, and the preview only
  // shows once it is turned (where it was last tapped).
  const carry = (event: PointerEvent<HTMLElement>) => {
    if (!inHand || event.pointerType === "touch") return;
    const at = onPage(event.clientX, event.clientY);
    if (!at) return;
    const inside = at.x >= 0 && at.x <= 1 && at.y >= 0 && at.y <= 1;
    if (inside) aim.current = { ...at, on: true };
    else aim.current.on = false;
    preview();
    hand.current?.point(event.clientX, event.clientY);
  };
  const letGo = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    aim.current.on = false;
    preview();
    hand.current?.hide();
  };

  /** Down comes the stamp – the print appears as it touches. */
  const stampHere = (event: PointerEvent<HTMLDivElement>) => {
    if (!inHand) {
      // A tap beside the prints lets go of the picked one.
      if (event.target === event.currentTarget) setPicked(null);
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = onPage(event.clientX, event.clientY);
    if (!at) return;
    const stamp = inHand;
    const inked = ink;
    const spot = { x: within(at.x), y: within(at.y) };
    const rotation = tidy(turn.current);
    const touch = () => {
      print(stamp, spot, rotation, inked);
      // The print took its preview's place – it's back when the stamp
      // moves on (and stays if it already has).
      if (aim.current.x === spot.x && aim.current.y === spot.y) {
        aim.current.on = false;
        preview();
      }
    };
    if (hand.current) hand.current.press(event.clientX, event.clientY, touch);
    else touch();
    aim.current.x = spot.x;
    aim.current.y = spot.y;
    preview();
  };

  /** With a stamp in hand: down onto the blot – it comes up in that ink. */
  const dipInto =
    (color: ColorName) => (event: PointerEvent<HTMLButtonElement>) => {
      if (!(inHand && hand.current)) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const blot = event.currentTarget;
      const soak = () => {
        chooseInk(color, false);
        squash(blot);
      };
      hand.current.press(event.clientX, event.clientY, soak);
    };

  return (
    <Sheet
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {title}
          {date === todayKey() && (
            <span className="rounded-full border-2 border-ink bg-sun px-2 py-0.5 font-black text-xs">
              {t.app.today}
            </span>
          )}
        </span>
      }
    >
      {/* The page and the inks: where the stamp in hand shows. */}
      <div
        className="flex flex-col gap-4"
        onPointerEnter={carry}
        onPointerLeave={letGo}
        onPointerMove={carry}
      >
        <div
          className={cn(
            "relative aspect-square w-full touch-none select-none overflow-hidden rounded-3xl border-2 border-ink bg-card bg-[radial-gradient(var(--color-line)_1.3px,transparent_1.3px)] bg-size-[18px_18px]",
            // The preview marks the spot – no arrow on top of it.
            inHand && "cursor-none"
          )}
          onPointerDown={stampHere}
          ref={page}
        >
          {placements.length === 0 && (
            <p className="pointer-events-none absolute inset-0 flex animate-fade items-center justify-center p-10 text-center font-bold text-muted">
              {t.app.day.empty}
            </p>
          )}
          {placements.map((p) => {
            const stamp = boop.stamps[p.stamp];
            const here = drag?.id === p.id ? drag : p;
            return (
              <div
                className={cn(
                  "absolute",
                  glide === p.id && "transition-[left,top] duration-300"
                )}
                key={p.id}
                onTransitionEnd={() => setGlide(null)}
                style={{
                  width: `${PRINT * 100}%`,
                  left: `${here.x * 100}%`,
                  top: `${here.y * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${p.rotation}deg) scale(${p.scale})`,
                  zIndex: drag?.id === p.id ? 1000 : p.z,
                }}
              >
                <button
                  aria-label={stamp?.name || t.app.day.print}
                  aria-pressed={picked === p.id}
                  className={cn(
                    "block w-full rounded-2xl mix-blend-multiply",
                    // With a stamp in hand the page is for stamping.
                    inHand
                      ? "pointer-events-none"
                      : "cursor-grab active:cursor-grabbing",
                    !old.has(p.id) && "animate-ink",
                    picked === p.id &&
                      "bg-violet-soft outline-2 outline-violet outline-dashed"
                  )}
                  onPointerDown={(event) => {
                    const at = onPage(event.clientX, event.clientY);
                    if (!at) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDrag({
                      id: p.id,
                      x: p.x,
                      y: p.y,
                      grab: { x: at.x - p.x, y: at.y - p.y },
                      from: { x: event.clientX, y: event.clientY },
                      moved: false,
                    });
                  }}
                  onPointerMove={(event) => {
                    if (drag?.id !== p.id) return;
                    const far =
                      Math.hypot(
                        event.clientX - drag.from.x,
                        event.clientY - drag.from.y
                      ) >= DRAG;
                    const at = onPage(event.clientX, event.clientY);
                    if (!(at && (drag.moved || far))) return;
                    setDrag({
                      ...drag,
                      x: within(at.x - drag.grab.x),
                      y: within(at.y - drag.grab.y),
                      moved: true,
                    });
                  }}
                  onPointerUp={() => {
                    if (drag?.id !== p.id) return;
                    if (drag.moved) {
                      const top = Math.max(...placements.map((q) => q.z)) + 1;
                      note({ kind: "move", id: p.id, x: p.x, y: p.y, z: p.z });
                      void movePlacement(p.id, {
                        x: drag.x,
                        y: drag.y,
                        ...(p.z < top - 1 && { z: top }),
                      });
                    } else setPicked(picked === p.id ? null : p.id);
                    setDrag(null);
                  }}
                  type="button"
                >
                  <StampSvg
                    className="pointer-events-none h-auto w-full"
                    color={p.ink ?? stamp?.color ?? "ink"}
                    drawing={stamp?.drawing ?? null}
                    print
                    seed={seedOf(p.id)}
                    shape={stamp?.shape}
                  />
                </button>
              </div>
            );
          })}
          {inHand && (
            // The next print, faintly: where and how the stamp will leave
            // it. Moved by preview(), so no style of React's is in its way.
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 left-0 aspect-square mix-blend-multiply will-change-transform"
              ref={ghost}
              style={{ width: `${PRINT * 100}%`, zIndex: 2000 }}
            >
              <div className="opacity-0 transition-[rotate,opacity] duration-150 ease-out">
                <StampSvg
                  className="h-auto w-full"
                  color={ink}
                  drawing={inHand.drawing}
                  print
                  seed={seedOf(next)}
                  shape={inHand.shape}
                />
              </div>
            </div>
          )}
        </div>

        <fieldset className="min-w-0">
          <legend className="mb-2 font-bold text-muted text-sm">
            {t.app.day.ink}
          </legend>
          {/* Flat blots of ink, in a row that wraps – nothing scrolls, so
              the marker ring round the one in use is never cut. */}
          <div className="flex flex-wrap gap-1.5">
            {palette.map(({ key: c, hex, name: names }, i) => (
              <button
                aria-label={names[locale]}
                aria-pressed={ink === c}
                className={cn(
                  "relative flex h-11 w-11 items-center justify-center rounded-full transition-transform",
                  ink === c ? "scale-110" : "hover:-rotate-6 hover:scale-110"
                )}
                key={c}
                // With a stamp in hand the blot is dipped into (dipInto) –
                // unless it is chosen by keyboard.
                onClick={(event) => {
                  if (!inHand || event.detail === 0) chooseInk(c);
                }}
                onPointerDown={dipInto(c)}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  className="h-9 w-9"
                  fill={hex}
                  // Each lies a little differently.
                  style={{ rotate: `${(i * 67) % 360}deg` }}
                  viewBox="0 0 40 40"
                >
                  <path d={BLOTS[i % BLOTS.length]} />
                </svg>
                {ink === c && (
                  // The one in use: ringed with a marker.
                  <Circle
                    className="pointer-events-none absolute -top-1 -left-1 h-13 w-13 animate-fade text-ink [&_path]:[vector-effect:non-scaling-stroke]"
                    preserveAspectRatio="none"
                    strokeWidth={2.5}
                  />
                )}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex min-h-10 items-center justify-between gap-2">
        <p className="font-bold text-muted text-sm">
          {inHand ? t.app.day.held : t.app.day.tray}
          {inHand && (
            // Only where there is likely a wheel.
            <span className="hidden [@media(hover:hover)]:inline">
              {" "}
              {t.app.day.wheel}
            </span>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {inHand && (
            // Turning without a wheel – a pair, apart from undo's arrow.
            <div className="flex rounded-full border-2 border-ink bg-violet-soft">
              {(
                [
                  [-STEP, t.app.day.turnLeft, "rounded-l-full", ""],
                  // The same arrow, the other way round.
                  [STEP, t.app.day.turnRight, "rounded-r-full", "-scale-x-100"],
                ] as const
              ).map(([degrees, label, end, flip]) => (
                <button
                  aria-label={label}
                  className={cn(
                    "flex h-8 w-9 items-center justify-center transition hover:bg-violet/20 active:bg-violet/35",
                    end
                  )}
                  key={degrees}
                  onClick={() => turnBy(degrees)}
                  title={label}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className={cn("h-4.5 w-4.5", flip)}
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.6"
                    viewBox="0 0 24 24"
                  >
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
              ))}
            </div>
          )}
          {picked && (
            <Button
              onClick={() => {
                const gone = boop.placements[picked];
                if (gone) note({ kind: "remove", id: picked, print: gone });
                void removePlacement(picked);
                setPicked(null);
              }}
              size="sm"
              variant="plain"
            >
              {t.app.day.remove}
            </Button>
          )}
          <button
            aria-label={t.app.day.undo}
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink bg-card shadow-sticker-sm transition hover:-rotate-12 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none"
            disabled={!undoable}
            onClick={undo}
            title={t.app.day.undo}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="h-4.5 w-4.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.8"
              viewBox="0 0 24 24"
            >
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
          </button>
        </div>
      </div>

      {stamps.length === 0 ? (
        <p className="text-muted text-sm">{t.app.noStamps}</p>
      ) : (
        // Room all round inside the scroller (it clips both ways): a stamp
        // can lift, turn and wear its badge without losing a corner.
        <div className="-m-3 flex gap-2 overflow-x-auto p-3">
          {stamps.map((s) => (
            <button
              aria-label={s.name || t.app.day.print}
              aria-pressed={held === s.id}
              className={cn(
                "relative h-20 w-20 shrink-0 rounded-3xl border-2 border-ink bg-soft p-1 transition",
                held === s.id
                  ? "-translate-y-1.5 bg-violet-soft shadow-sticker ring-4 ring-violet/30"
                  : "hover:-rotate-6 hover:bg-violet-soft active:scale-90"
              )}
              key={s.id}
              onClick={(event) => {
                // By keyboard there is no pointing at the page: the stamp
                // comes down somewhere on it.
                if (event.detail === 0) {
                  const spot = () => 0.25 + Math.random() * 0.5;
                  print(s, { x: spot(), y: spot() }, tidy(turn.current), ink);
                  return;
                }
                take(held === s.id ? null : s.id);
              }}
              type="button"
            >
              <span className="block animate-press-dip" key={dip}>
                <Sticker className="pointer-events-none" stamp={s} />
              </span>
              {held === s.id && (
                <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 animate-fade whitespace-nowrap rounded-full border-2 border-ink bg-sun px-1.5 font-black text-[9px] leading-4">
                  {t.app.day.inHand}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <StampHand ink={ink} ref={hand} stamp={inHand} unit={unit} />
    </Sheet>
  );
};
