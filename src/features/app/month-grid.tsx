"use client";

import { AnimatePresence, m, type Variants } from "motion/react";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "@/components/doodles";
import { SPRING } from "@/components/motion";
import { Ruling } from "@/components/ruling";
import { buttonClass, ROUND_BUTTON } from "@/components/ui";
import { type DayKey, todayKey } from "@/features/calendar/model";
import { Glitter, StampSvg } from "@/features/calendar/stamp-svg";
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
  "scribble scribble-bare scribble-clear scribble-sm relative flex aspect-square min-h-0 flex-col rounded-xl p-1 text-left [--scribble-inset:4px] [--scribble-ring:5px] hover:scribble-soft active:scribble-soft sm:p-2";

/**
 * On the weekend's wash the blob is that grey itself – there it is a shade
 * darker, between paper grey and pencil.
 */
const WEEKEND =
  "hover:[--scribble-fill:color-mix(in_oklab,var(--color-soft),var(--color-line))]! active:[--scribble-fill:color-mix(in_oklab,var(--color-soft),var(--color-line))]!";

/** Saturday and Sunday – the last two columns, Monday first. */
const weekend = (cell: number) => cell % 7 >= 5;

/**
 * A day of the month before or after, in the cells around this one: only
 * its number, faint. Pointed at, an arrow shows the way; tapped, that month
 * opens.
 */
const Beside = ({
  day,
  by,
  cell,
  dir,
  label,
  onClick,
}: {
  day: number;
  /** −1: the month before, 1: the one after. */
  by: -1 | 1;
  cell: number;
  dir: number;
  label: string;
  onClick: () => void;
}) => {
  const Arrow = by < 0 ? ArrowLeft : ArrowRight;
  return (
    <m.button
      aria-label={label}
      className={cn(DAY, "group", weekend(cell) && WEEKEND)}
      custom={{ dir, order: orderOf(cell, dir) }}
      onClick={onClick}
      title={label}
      type="button"
      variants={DAY_TURN}
    >
      <span className="font-black text-[11px] text-muted/50 leading-none sm:text-sm">
        {day}
      </span>
      <span
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100",
          // It slides in the way it points.
          by < 0 ? "translate-x-1" : "-translate-x-1"
        )}
      >
        <Arrow className="h-5 w-5 sm:h-6 sm:w-6" />
      </span>
    </m.button>
  );
};

/**
 * A new month comes in like a page turned: its days in a wave from the side
 * the months went (from the right when forward), each a little tilted,
 * settling with a spring – then their prints land, as if stamped just now.
 * The month before slides away the other way. The first one comes up from
 * below.
 */
type Turn = { dir: number; order: number };

/** Where a day's wave starts: the side it comes from, top row first. */
const orderOf = (cell: number, dir: number) =>
  (dir > 0 ? 6 - (cell % 7) : cell % 7) + Math.floor(cell / 7);

const DAY_TURN: Variants = {
  hidden: ({ dir }: Turn) => ({
    opacity: 0,
    x: dir * 14,
    y: dir ? 0 : 8,
    rotate: dir * -4,
    scale: 0.88,
  }),
  shown: ({ order }: Turn) => ({
    opacity: 1,
    x: 0,
    y: 0,
    rotate: 0,
    scale: 1,
    transition: { ...SPRING.bouncy, delay: order * 0.022 },
  }),
};

const PRINT_TURN: Variants = {
  hidden: { opacity: 0, scale: 1.35, rotate: -8 },
  shown: ({ order }: Turn) => ({
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: { ...SPRING.bouncy, delay: order * 0.022 + 0.18 },
  }),
};

const MONTH_TURN: Variants = {
  hidden: {},
  shown: {},
  gone: (dir: number) => ({
    opacity: 0,
    x: dir * -24,
    transition: { duration: 0.16, ease: "easeIn" },
  }),
};

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
  const beside = (by: number) => {
    const next = new Date(month.year, month.month + by, 1);
    return { year: next.getFullYear(), month: next.getMonth() };
  };
  const shift = (by: number) => onMonth(beside(by));
  const now = new Date();
  const thisMonth =
    now.getFullYear() === month.year && now.getMonth() === month.month;
  // How many weeks the table rules – the cells before and after the month
  // hold the days around it.
  const rows = Math.ceil((offset + length) / 7);
  const before = beside(-1);
  const after = beside(1);
  const lengthBefore = new Date(month.year, month.month, 0).getDate();
  // Which way the months went – the new one turns in from that side.
  const index = month.year * 12 + month.month;
  const [turn, setTurn] = useState({ index, dir: 0 });
  if (turn.index !== index) {
    setTurn({ index, dir: Math.sign(index - turn.index) });
  }
  const dir = turn.index === index ? turn.dir : Math.sign(index - turn.index);
  const labelOf = ({ year, month }: Month) => `${t.app.months[month]} ${year}`;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <m.h2
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          className="origin-left text-3xl leading-none"
          initial={{ opacity: 0, x: dir * 18, rotate: dir * -2 }}
          key={index}
          transition={SPRING.bouncy}
        >
          {t.app.months[month.month]}{" "}
          <span className="font-bold text-muted">{month.year}</span>
        </m.h2>
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
        {/* On a phone the cells are small: a finer marker, so the lines don't
            outweigh the prints. */}
        <Ruling
          className="[--scribble-width:1.5px] sm:[--scribble-width:2.5px]"
          rows={rows}
          shade={2}
        />
        <AnimatePresence custom={dir} mode="popLayout">
          <m.div
            animate="shown"
            className="grid w-full grid-cols-7"
            custom={dir}
            exit="gone"
            initial="hidden"
            key={index}
            variants={MONTH_TURN}
          >
            {Array.from({ length: offset }, (_, i) => (
              <Beside
                by={-1}
                cell={i}
                day={lengthBefore - offset + i + 1}
                dir={dir}
                key={`before-${i}`}
                label={labelOf(before)}
                onClick={() => onMonth(before)}
              />
            ))}
            {Array.from({ length }, (_, i) => {
              const date = key(month.year, month.month, i + 1);
              const day = byDay.get(date) ?? [];
              const isToday = date === today;
              return (
                <m.button
                  aria-current={isToday ? "date" : undefined}
                  className={cn(DAY, weekend(offset + i) && WEEKEND)}
                  custom={{ dir, order: orderOf(offset + i, dir) }}
                  key={date}
                  onClick={() => onDay(date)}
                  type="button"
                  variants={DAY_TURN}
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
                    take what room there is – a day stays square. On a phone
                    a day is too small to share: the top print shows, big,
                    and a count says how many more there are. */}
                  <m.span
                    className={cn(
                      "grid min-h-0 flex-1 auto-rows-fr place-items-center max-sm:grid-cols-1 max-sm:[&>*:nth-child(n+2)]:hidden",
                      day.length === 1 ? "grid-cols-1" : "grid-cols-2"
                    )}
                    custom={{ dir, order: orderOf(offset + i, dir) }}
                    variants={PRINT_TURN}
                  >
                    {day.slice(0, 4).map((p, n) => {
                      const stamp = stamps[p.stamp];
                      const inked = p.ink ?? stamp?.color ?? "red";
                      const print = (
                        <StampSvg
                          className={
                            stamp?.drawing?.special
                              ? "h-full w-full"
                              : "h-[90%] w-[90%] mix-blend-multiply"
                          }
                          color={inked}
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
                      // A special one: as big as its room allows, with a few
                      // sparkles that hold still – a month has many days.
                      return stamp?.drawing?.special ? (
                        <span
                          className="relative h-full w-full mix-blend-multiply"
                          key={p.id}
                        >
                          {print}
                          <Glitter
                            color={inked}
                            drawing={stamp.drawing}
                            seed={seedOf(p.id)}
                            shape={stamp.shape}
                            still
                          />
                        </span>
                      ) : (
                        print
                      );
                    })}
                  </m.span>
                  {day.length > 1 && (
                    <span className="absolute right-0.5 bottom-0.5 rounded-full bg-ink px-1 font-black text-[9px] text-white leading-3.5 sm:hidden">
                      +{day.length - 1}
                    </span>
                  )}
                </m.button>
              );
            })}
            {Array.from({ length: rows * 7 - offset - length }, (_, i) => (
              <Beside
                by={1}
                cell={offset + length + i}
                day={i + 1}
                dir={dir}
                key={`after-${i}`}
                label={labelOf(after)}
                onClick={() => onMonth(after)}
              />
            ))}
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
