"use client";

import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "valtio";
import { Button } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import {
  COLOR_NAMES,
  COLORS,
  type ColorName,
  type DayKey,
  isColorName,
  type StampDoc,
  todayKey,
} from "@/features/calendar/model";
import { StampSvg } from "@/features/calendar/stamp-svg";
import {
  movePlacement,
  placeStamp,
  removePlacement,
  useBoop,
} from "@/features/offline/store";
import { Sticker } from "@/features/stickers/sticker";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { Sheet } from "./sheet";

type Stamp = Snapshot<StampDoc>;

/** How far a finger moves before a tap becomes a drag. */
const DRAG = 8;

/** The ink pad last used on this device. */
const INK_KEY = "boop-ink";

/** A print's own imperfections, from its id. */
export const seedOf = (id: string) =>
  (Number.parseInt(id.slice(0, 6), 16) || 7) % 997;

/**
 * A day of a calendar: its page with the prints on it, and the tray of 3D
 * stamps. Tap a stamp – it comes down somewhere on the page; drag it – it
 * comes down where you let go. Prints can be moved, picked and removed.
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
  const [picked, setPicked] = useState<string | null>(null);
  // A print being moved – written once it is let go.
  const [drag, setDrag] = useState<{
    id: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  // A stamp from the tray following the finger.
  const [ghost, setGhost] = useState<{
    stamp: Stamp;
    x: number;
    y: number;
  } | null>(null);
  const tray = useRef<{
    id: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  // The ink pad in use – and a dip of the stamps when it changes.
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
  const chooseInk = (next: ColorName) => {
    setInk(next);
    setDip((n) => n + 1);
    try {
      localStorage.setItem(INK_KEY, next);
    } catch {
      // Remembered for this visit only.
    }
  };
  // Stamps coming down right now (the press animation).
  const [presses, setPresses] = useState<
    { key: number; stamp: Stamp; x: number; y: number }[]
  >([]);

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

  /** A point on the page (0–1), or null when outside it. */
  const onPage = (clientX: number, clientY: number, clamp = false) => {
    const box = page.current?.getBoundingClientRect();
    if (!box) return null;
    const x = (clientX - box.left) / box.width;
    const y = (clientY - box.top) / box.height;
    if (!clamp && (x < 0 || x > 1 || y < 0 || y > 1)) return null;
    return { x: Math.min(Math.max(x, 0), 1), y: Math.min(Math.max(y, 0), 1) };
  };

  /** Down comes the stamp – the print appears as it presses. */
  const stampAt = (stamp: Stamp, x: number, y: number) => {
    const key = Date.now() + Math.random();
    setPresses((all) => [...all, { key, stamp, x, y }]);
    setTimeout(() => {
      void placeStamp({
        calendar,
        date,
        stamp: stamp.id,
        x,
        y,
        rotation: Math.round(Math.random() * 24 - 12),
        ink,
      });
    }, 270);
    trackEvent("stamp-placed");
  };

  const trayDown =
    (stamp: Stamp) => (event: PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      tray.current = {
        id: stamp.id,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
    };

  const trayMove =
    (stamp: Stamp) => (event: PointerEvent<HTMLButtonElement>) => {
      const start = tray.current;
      if (start?.id !== stamp.id) return;
      if (
        !start.moved &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG
      ) {
        return;
      }
      start.moved = true;
      setGhost({ stamp, x: event.clientX, y: event.clientY });
    };

  const trayUp = (stamp: Stamp) => (event: PointerEvent<HTMLButtonElement>) => {
    const start = tray.current;
    tray.current = null;
    setGhost(null);
    if (start?.id !== stamp.id) return;
    if (!start.moved) {
      stampAt(stamp, 0.25 + Math.random() * 0.5, 0.25 + Math.random() * 0.5);
      return;
    }
    const at = onPage(event.clientX, event.clientY);
    if (at) stampAt(stamp, at.x, at.y);
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
      <div
        className="relative aspect-square w-full touch-none overflow-hidden rounded-3xl border-2 border-ink bg-card bg-[radial-gradient(var(--color-line)_1.3px,transparent_1.3px)] bg-size-[18px_18px]"
        ref={page}
      >
        {placements.length === 0 && presses.length === 0 && (
          <p className="absolute inset-0 flex animate-fade items-center justify-center p-10 text-center font-bold text-muted">
            {t.app.day.empty}
          </p>
        )}
        {placements.map((p) => {
          const stamp = boop.stamps[p.stamp];
          const here = drag?.id === p.id ? drag : p;
          return (
            <div
              className="absolute w-[26%]"
              key={p.id}
              style={{
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
                  "block w-full animate-boop cursor-grab rounded-2xl mix-blend-multiply active:cursor-grabbing",
                  picked === p.id &&
                    "bg-violet-soft outline-2 outline-violet outline-dashed"
                )}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  const at = onPage(event.clientX, event.clientY, true);
                  if (at) setDrag({ id: p.id, ...at, moved: false });
                }}
                onPointerMove={(event) => {
                  if (drag?.id !== p.id) return;
                  const at = onPage(event.clientX, event.clientY, true);
                  if (at) setDrag({ id: p.id, ...at, moved: true });
                }}
                onPointerUp={() => {
                  if (drag?.id !== p.id) return;
                  if (drag.moved) {
                    const top = Math.max(...placements.map((q) => q.z)) + 1;
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
        {presses.map((press) => (
          <div
            className="pointer-events-none absolute w-[30%] animate-press"
            key={press.key}
            onAnimationEnd={() =>
              setPresses((all) => all.filter((p) => p.key !== press.key))
            }
            style={{
              left: `${press.x * 100}%`,
              top: `${press.y * 100}%`,
              zIndex: 2000,
            }}
          >
            <Sticker pose="press" stamp={press.stamp} />
          </div>
        ))}
      </div>

      <fieldset className="flex items-center gap-2 overflow-x-auto pb-1">
        <legend className="mb-2 font-bold text-muted text-sm">
          {t.app.day.ink}
        </legend>
        {COLOR_NAMES.map((c) => (
          <button
            aria-label={t.colors[c]}
            aria-pressed={ink === c}
            className={cn(
              "relative h-11 w-14 shrink-0 rounded-2xl border-2 border-ink transition-transform",
              ink === c
                ? "-translate-y-1 shadow-sticker-sm"
                : "hover:-translate-y-0.5"
            )}
            key={c}
            onClick={() => chooseInk(c)}
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
      </fieldset>

      <div className="flex min-h-10 items-center justify-between gap-2">
        <p className="font-bold text-muted text-sm">{t.app.day.tray}</p>
        {picked && (
          <Button
            onClick={() => {
              void removePlacement(picked);
              setPicked(null);
            }}
            size="sm"
            variant="plain"
          >
            {t.app.day.remove}
          </Button>
        )}
      </div>

      {stamps.length === 0 ? (
        <p className="text-muted text-sm">{t.app.noStamps}</p>
      ) : (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
          {stamps.map((s) => (
            <button
              aria-label={s.name || t.app.day.print}
              className="h-20 w-20 shrink-0 touch-none rounded-3xl border-2 border-ink bg-soft p-1 transition hover:-rotate-6 hover:bg-violet-soft active:scale-90"
              key={s.id}
              onPointerCancel={() => {
                tray.current = null;
                setGhost(null);
              }}
              onPointerDown={trayDown(s)}
              onPointerMove={trayMove(s)}
              onPointerUp={trayUp(s)}
              type="button"
            >
              <span className="block animate-press-dip" key={dip}>
                <Sticker className="pointer-events-none" stamp={s} />
              </span>
            </button>
          ))}
        </div>
      )}

      {ghost && (
        <div
          className="pointer-events-none fixed z-[100] w-24 -translate-x-1/2 -translate-y-1/2 rotate-[-8deg] scale-110"
          style={{ left: ghost.x, top: ghost.y }}
        >
          <Sticker pose="press" stamp={ghost.stamp} />
        </div>
      )}
    </Sheet>
  );
};
