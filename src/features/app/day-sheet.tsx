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
import { Button } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import {
  COLOR_NAMES,
  COLORS,
  type ColorName,
  type DayKey,
  isColorName,
  type PlacementDoc,
  type StampDoc,
  todayKey,
} from "@/features/calendar/model";
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
import { Sheet } from "./sheet";

type Stamp = Snapshot<StampDoc>;
type Print = Snapshot<PlacementDoc>;

/** How far a finger moves before a tap becomes a drag. */
const DRAG = 8;

/** The ink pad last used on this device. */
const INK_KEY = "boop-ink";

/**
 * A print's width on the page, and how much of the unit square its picture
 * spans (stamp-svg.tsx) – so one unit, the stamp's width, is a quarter page.
 */
const PRINT = 0.26;
const VIEW_BOX = 1.04;

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

/** An ink pad giving way under the stamp. */
const squash = (pad: HTMLElement) => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  pad.animate(
    [
      { transform: "none" },
      { transform: "scale(1.08, 0.78)", offset: 0.3 },
      { transform: "none" },
    ],
    { duration: 280, easing: "ease-out" }
  );
};

/**
 * A day of a calendar: its page with the prints on it, the ink pads and the
 * tray of stamps. Tap a stamp – it's in your hand (stamp-hand.tsx) and
 * follows the pointer; tap the page – it comes down right there; tap an ink
 * pad – it takes that ink. With no stamp in hand the prints can be moved,
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

  // One unit on the page in px – the stamp in hand is exactly that wide.
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

  // The ink pad in use – and a dip of the tray's stamps when it changes.
  const [ink, setInk] = useState<ColorName>("ink");
  const [dip, setDip] = useState(0);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(INK_KEY);
      if (isColorName(saved)) setInk(saved);
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
  const note = (step: Step | Promise<Step>) => {
    line.current = line.current
      .then(async () => {
        steps.current.push(await step);
        setUndoable(true);
      })
      .catch(() => undefined);
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

  // Escape puts the stamp down first – only then it closes the sheet (which
  // listens on the window too, so this one goes ahead of it). ⌘Z / Ctrl+Z.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && held) {
        event.stopImmediatePropagation();
        setHeld(null);
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.shiftKey && !event.altKey && event.key === "z") {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [held, undo]);

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

  /** A point on the page (0–1) – also beyond it, for whoever clamps. */
  const onPage = (clientX: number, clientY: number) => {
    const box = page.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      x: (clientX - box.left) / box.width,
      y: (clientY - box.top) / box.height,
    };
  };

  /** A print of this stamp on the page – noted, so it can be taken back. */
  const print = (stamp: Stamp, x: number, y: number, inked: ColorName) => {
    note(
      placeStamp({
        calendar,
        date,
        stamp: stamp.id,
        x,
        y,
        rotation: Math.round(Math.random() * 16 - 8),
        ink: inked,
      }).then((id): Step => ({ kind: "place", id }))
    );
    trackEvent("stamp-placed");
  };

  // Over the page and the ink pads the stamp in hand follows the pointer –
  // held higher below the page, so the pad under it stays in view. A finger
  // doesn't hover: there it goes where it is tapped.
  const carry = (event: PointerEvent<HTMLElement>) => {
    if (!inHand || event.pointerType === "touch") return;
    const below = page.current?.getBoundingClientRect().bottom ?? 0;
    hand.current?.point(event.clientX, event.clientY, event.clientY > below);
  };
  const letGo = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch") hand.current?.hide();
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
    const touch = () => print(stamp, within(at.x), within(at.y), inked);
    if (hand.current) hand.current.press(event.clientX, event.clientY, touch);
    else touch();
  };

  /** With a stamp in hand: down into the pad – it comes up in that ink. */
  const dipInto =
    (color: ColorName) => (event: PointerEvent<HTMLButtonElement>) => {
      if (!(inHand && hand.current)) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const pad = event.currentTarget;
      const soak = () => {
        chooseInk(color, false);
        squash(pad);
      };
      hand.current.press(event.clientX, event.clientY, soak, true);
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
      {/* The page and the ink pads: where the stamp in hand shows. */}
      <div
        className={cn("flex flex-col gap-4", inHand && "cursor-none")}
        onPointerEnter={carry}
        onPointerLeave={letGo}
        onPointerMove={carry}
      >
        <div
          className="relative aspect-square w-full touch-none select-none overflow-hidden rounded-3xl border-2 border-ink bg-card bg-[radial-gradient(var(--color-line)_1.3px,transparent_1.3px)] bg-size-[18px_18px]"
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
        </div>

        <fieldset className="min-w-0">
          <legend className="mb-2 font-bold text-muted text-sm">
            {t.app.day.ink}
          </legend>
          {/* As many columns as inks, never wider than a pad: nothing to
              scroll, so the picked pad's badge and shadow stay whole. */}
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${COLOR_NAMES.length}, minmax(0, 2.75rem))`,
            }}
          >
            {COLOR_NAMES.map((c) => (
              <button
                aria-label={t.colors[c]}
                aria-pressed={ink === c}
                className={cn(
                  "relative h-10 origin-bottom rounded-2xl border-2 border-ink transition-transform",
                  inHand && "cursor-none",
                  ink === c
                    ? "-translate-y-1 shadow-sticker-sm"
                    : "hover:-translate-y-0.5"
                )}
                key={c}
                // With a stamp in hand the pad is dipped into (dipInto) –
                // unless it is chosen by keyboard.
                onClick={(event) => {
                  if (!inHand || event.detail === 0) chooseInk(c);
                }}
                onPointerDown={dipInto(c)}
                style={{
                  background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${COLORS[c]} 55%, white) 0 18%, ${COLORS[c]} 45%, color-mix(in srgb, ${COLORS[c]} 70%, black))`,
                }}
                type="button"
              >
                {ink === c && (
                  <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-ink bg-card font-black text-[10px]">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex min-h-10 items-center justify-between gap-2">
        <p className="font-bold text-muted text-sm">
          {inHand ? t.app.day.held : t.app.day.tray}
        </p>
        <div className="flex shrink-0 items-center gap-2">
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
                  print(s, spot(), spot(), ink);
                  return;
                }
                setHeld(held === s.id ? null : s.id);
                setPicked(null);
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
