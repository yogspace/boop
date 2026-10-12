"use client";

import { useMemo } from "react";
import { ArrowLeft, ArrowRight } from "@/components/doodles";
import { Ruling } from "@/components/ruling";
import { buttonClass, ROUND_BUTTON } from "@/components/ui";
import { type DayKey, todayKey } from "@/features/calendar/model";
import { StampSvg } from "@/features/calendar/stamp-svg";
import { useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { seedOf } from "./day-sheet";

type Month = { year: number; month: number };

const key = (year: number, month: number, day: number): DayKey =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/**
 * A day in the ruled month: no frame of its own (the table's lines are the
 * month's, `Ruling`) – a soft blob under the pointer, the focus ring inside
 * its lines.
 */
const DAY =
  "scribble scribble-bare scribble-clear scribble-sm flex aspect-square min-h-0 flex-col rounded-xl p-1 text-left [--scribble-inset:4px] [--scribble-ring:5px] hover:scribble-soft active:scribble-soft sm:p-2";

/**
 * A month of a calendar, Monday first; each day shows its prints. Drawn as a
 * table ruled with a marker: today's number sits in an ink blob, the weekend
 * is hatched – the prints are the only color.
 */
export const MonthGrid = ({
  calendar,
  locale,
  month,
  onDay,
  onMonth,
}: {
  calendar: string;
  locale: Locale;
  month: Month;
  onDay: (day: DayKey) => void;
  onMonth: (month: Month) => void;
}) => {
  const t = dictionaryOf(locale);
  const { placements, stamps } = useBoop();
  const today = todayKey();

  const byDay = useMemo(() => {
    const days = new Map<DayKey, (typeof list)[number][]>();
    const list = Object.values(placements).filter(
      (p) => p.calendar === calendar
    );
    for (const p of list) days.set(p.date, [...(days.get(p.date) ?? []), p]);
    for (const [, day] of days) day.sort((a, b) => b.z - a.z);
    return days;
  }, [placements, calendar]);

  const first = new Date(month.year, month.month, 1);
  const offset = (first.getDay() + 6) % 7;
  const length = new Date(month.year, month.month + 1, 0).getDate();
  const shift = (by: number) => {
    const next = new Date(month.year, month.month + by, 1);
    onMonth({ year: next.getFullYear(), month: next.getMonth() });
  };
  const now = new Date();
  const thisMonth =
    now.getFullYear() === month.year && now.getMonth() === month.month;
  // How many weeks the table rules.
  const rows = Math.ceil((offset + length) / 7);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-3xl leading-none">
          {t.app.months[month.month]}{" "}
          <span className="font-bold text-muted">{month.year}</span>
        </h2>
        <div className="flex gap-2">
          {!thisMonth && (
            <button
              className={cn(
                buttonClass({ variant: "plain", size: "sm" }),
                "h-10"
              )}
              onClick={() =>
                onMonth({ year: now.getFullYear(), month: now.getMonth() })
              }
              type="button"
            >
              {t.app.today}
            </button>
          )}
          <button
            aria-label={t.app.prev}
            className={ROUND_BUTTON}
            onClick={() => shift(-1)}
            type="button"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button
            aria-label={t.app.next}
            className={ROUND_BUTTON}
            onClick={() => shift(1)}
            type="button"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 pb-1.5">
        {t.app.weekdays.map((name) => (
          <div
            className="text-center font-black text-muted text-xs uppercase tracking-wide"
            key={name}
          >
            {name}
          </div>
        ))}
      </div>
      {/* The ruled table stays as it is from month to month – only the days
          in it are swapped (and fade in). */}
      <div className="relative isolate">
        <Ruling className="[--scribble-width:2.5px]" rows={rows} shade={2} />
        <div
          className="grid animate-fade grid-cols-7"
          key={`${month.year}-${month.month}`}
        >
          {Array.from({ length: offset }, (_, i) => (
            <div key={`gap-${i}`} />
          ))}
          {Array.from({ length }, (_, i) => {
            const date = key(month.year, month.month, i + 1);
            const day = byDay.get(date) ?? [];
            const isToday = date === today;
            return (
              <button
                aria-current={isToday ? "date" : undefined}
                className={DAY}
                key={date}
                onClick={() => onDay(date)}
                type="button"
              >
                <span
                  className={cn(
                    "font-black text-[11px] leading-none sm:text-sm",
                    // The blob reaches over the number's line – the prints
                    // below keep their room.
                    isToday &&
                      "scribble scribble-sm scribble-ink -my-[0.4em] -ml-[0.3em] flex h-[2.1em] w-[2.1em] shrink-0 items-center justify-center self-start rounded-full"
                  )}
                >
                  {i + 1}
                </span>
                {/* One print has the day to itself; more share it. The rows
                    take what room there is – a day stays square. */}
                <span
                  className={cn(
                    "grid min-h-0 flex-1 auto-rows-fr place-items-center",
                    day.length === 1 ? "grid-cols-1" : "grid-cols-2"
                  )}
                >
                  {day.slice(0, 4).map((p, n) => {
                    const stamp = stamps[p.stamp];
                    return (
                      <StampSvg
                        className="h-[90%] w-[90%] mix-blend-multiply"
                        color={p.ink ?? stamp?.color ?? "ink"}
                        drawing={stamp?.drawing ?? null}
                        key={p.id}
                        print
                        seed={seedOf(p.id)}
                        shape={stamp?.shape}
                        title={
                          n === 3 && day.length > 4
                            ? `+${day.length - 3}`
                            : undefined
                        }
                      />
                    );
                  })}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
