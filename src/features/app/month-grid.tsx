"use client";

import { useMemo } from "react";
import { type DayKey, todayKey } from "@/features/calendar/model";
import { StampSvg } from "@/features/calendar/stamp-svg";
import { useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

type Month = { year: number; month: number };

const key = (year: number, month: number, day: number): DayKey =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** A month of a calendar, Monday first; each day shows its top stamps. */
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
    const days = new Map<DayKey, typeof list>();
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

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          aria-label={t.app.prev}
          className="rounded-full border-2 border-ink bg-card px-3 py-1 font-bold"
          onClick={() => shift(-1)}
          type="button"
        >
          ←
        </button>
        <h2 className="font-doodle font-bold text-2xl">
          {t.app.months[month.month]} {month.year}
        </h2>
        <div className="flex gap-2">
          <button
            className="rounded-full border-2 border-ink bg-card px-3 py-1 font-bold text-sm"
            onClick={() => {
              const now = new Date();
              onMonth({ year: now.getFullYear(), month: now.getMonth() });
            }}
            type="button"
          >
            {t.app.today}
          </button>
          <button
            aria-label={t.app.next}
            className="rounded-full border-2 border-ink bg-card px-3 py-1 font-bold"
            onClick={() => shift(1)}
            type="button"
          >
            →
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {t.app.weekdays.map((name) => (
          <div className="pb-1 font-bold text-muted text-xs" key={name}>
            {name}
          </div>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: empty cells
          <div key={`gap-${i}`} />
        ))}
        {Array.from({ length }, (_, i) => {
          const date = key(month.year, month.month, i + 1);
          const day = byDay.get(date) ?? [];
          return (
            <button
              className={cn(
                "relative flex aspect-square flex-col items-center rounded-xl border-2 bg-paper p-1 transition hover:bg-paper-deep",
                date === today ? "border-coral" : "border-line"
              )}
              key={date}
              onClick={() => onDay(date)}
              type="button"
            >
              <span className="self-start font-bold text-xs leading-none">
                {i + 1}
              </span>
              <span className="grid flex-1 grid-cols-2 place-items-center gap-0.5">
                {day.slice(0, 4).map((p) => {
                  const stamp = stamps[p.stamp];
                  return (
                    <StampSvg
                      className="h-4 w-4 sm:h-6 sm:w-6"
                      color={stamp?.color ?? "ink"}
                      drawing={stamp?.drawing ?? null}
                      key={p.id}
                    />
                  );
                })}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
