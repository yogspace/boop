"use client";

import { type PointerEvent, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/features/analytics/client";
import type { DayKey, StampDoc } from "@/features/calendar/model";
import { StampSvg } from "@/features/calendar/stamp-svg";
import {
  movePlacement,
  placeStamp,
  removePlacement,
  useBoop,
} from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { Sheet } from "./sheet";

/**
 * A day of a calendar: its canvas with the placed stamps – drag to move,
 * tap to pick (and remove) – and the tray of stamps to boop onto it.
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
  stamps: StampDoc[];
  onClose: () => void;
}) => {
  const t = dictionaryOf(locale);
  const boop = useBoop();
  const canvas = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<string | null>(null);
  // Where a dragged stamp is right now – written once it is let go.
  const [drag, setDrag] = useState<{
    id: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);

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

  const at = (event: PointerEvent) => {
    const box = canvas.current?.getBoundingClientRect();
    if (!box) return { x: 0.5, y: 0.5 };
    return {
      x: Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1),
      y: Math.min(Math.max((event.clientY - box.top) / box.height, 0), 1),
    };
  };

  const boopIt = (stamp: string) => {
    void placeStamp({
      calendar,
      date,
      stamp,
      x: 0.3 + Math.random() * 0.4,
      y: 0.3 + Math.random() * 0.4,
      rotation: Math.round(Math.random() * 30 - 15),
    });
    trackEvent("stamp-placed");
  };

  return (
    <Sheet onClose={onClose} title={title}>
      <div
        className="relative aspect-square w-full touch-none overflow-hidden rounded-2xl border-2 border-ink bg-paper bg-[radial-gradient(var(--color-line)_1.5px,transparent_1.5px)] bg-size-[18px_18px]"
        ref={canvas}
      >
        {placements.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-muted">
            {t.app.day.empty}
          </p>
        )}
        {placements.map((p) => {
          const stamp = boop.stamps[p.stamp];
          const here = drag?.id === p.id ? drag : p;
          return (
            <div
              className="absolute w-[24%]"
              key={p.id}
              style={{
                left: `${here.x * 100}%`,
                top: `${here.y * 100}%`,
                transform: `translate(-50%, -50%) rotate(${p.rotation}deg) scale(${p.scale})`,
                zIndex: drag?.id === p.id ? 1000 : p.z,
              }}
            >
              <button
                aria-label={stamp?.name || "Stamp"}
                className={cn(
                  "block w-full animate-boop cursor-grab rounded-xl active:cursor-grabbing",
                  picked === p.id && "outline-2 outline-ink outline-dashed"
                )}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDrag({ id: p.id, ...at(event), moved: false });
                }}
                onPointerMove={(event) => {
                  if (drag?.id !== p.id) return;
                  setDrag({ id: p.id, ...at(event), moved: true });
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
                  color={stamp?.color ?? "ink"}
                  drawing={stamp?.drawing ?? null}
                />
              </button>
            </div>
          );
        })}
      </div>

      {picked && (
        <button
          className="self-start rounded-full border-2 border-ink bg-card px-4 py-1.5 font-bold text-sm"
          onClick={() => {
            void removePlacement(picked);
            setPicked(null);
          }}
          type="button"
        >
          {t.app.day.remove}
        </button>
      )}

      <div>
        <p className="mb-2 font-bold text-muted text-sm">{t.app.day.tray}</p>
        {stamps.length === 0 ? (
          <p className="text-muted text-sm">{t.app.noStamps}</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {stamps.map((s) => (
              <button
                aria-label={s.name || "Stamp"}
                className="h-16 w-16 shrink-0 rounded-2xl border-2 border-ink bg-card p-2 active:animate-wiggle"
                key={s.id}
                onClick={() => boopIt(s.id)}
                type="button"
              >
                <StampSvg className="h-full w-full" color={s.color} drawing={s.drawing} />
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
};
