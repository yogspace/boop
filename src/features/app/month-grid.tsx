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

const NAV =
  "flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink bg-card font-black shadow-sticker-sm transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none";

/** A month of a calendar, Monday first; each day shows its prints. */
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
              className={cn(NAV, "w-auto px-3 font-bold text-sm")}
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
            className={NAV}
            onClick={() => shift(-1)}
            type="button"
          >
            ←
          </button>
          <button
            aria-label={t.app.next}
            className={NAV}
            onClick={() => shift(1)}
            type="button"
          >
            →
          </button>
        </div>
      </div>
      <div
        className="grid animate-fade grid-cols-7 gap-1.5 sm:gap-2"
        key={`${month.year}-${month.month}`}
      >
        {t.app.weekdays.map((name) => (
          <div
            className="pb-1 text-center font-black text-muted text-xs uppercase tracking-wide"
            key={name}
          >
            {name}
          </div>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <div key={`gap-${i}`} />
        ))}
        {Array.from({ length }, (_, i) => {
          const date = key(month.year, month.month, i + 1);
          const day = byDay.get(date) ?? [];
          const weekend = (offset + i) % 7 >= 5;
          const isToday = date === today;
          return (
            <button
              className={cn(
                "group relative flex aspect-square flex-col rounded-2xl border-2 p-1 text-left transition hover:-translate-y-0.5 hover:border-ink sm:p-1.5",
                isToday
                  ? "border-violet bg-violet-soft"
                  : weekend
                    ? "border-transparent bg-pink-soft/70"
                    : "border-transparent bg-soft"
              )}
              key={date}
              onClick={() => onDay(date)}
              type="button"
            >
              <span
                className={cn(
                  "font-black text-xs leading-none sm:text-sm",
                  isToday && "text-violet"
                )}
              >
                {i + 1}
              </span>
              <span className="grid flex-1 grid-cols-2 place-items-center">
                {day.slice(0, 4).map((p, n) => {
                  const stamp = stamps[p.stamp];
                  return (
                    <StampSvg
                      className="h-[90%] w-[90%] mix-blend-multiply"
                      color={stamp?.color ?? "ink"}
                      drawing={stamp?.drawing ?? null}
                      key={p.id}
                      print
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
  );
};
