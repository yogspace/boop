"use client";

import { m } from "motion/react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "@/components/doodles";
import { SPRING } from "@/components/motion";
import { Ruling } from "@/components/ruling";
import { buttonClass, ROUND_BUTTON } from "@/components/ui";
import type { DayKey } from "@/features/calendar/model";
import { cleanNote, notePreview } from "@/features/calendar/note";
import { useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import {
  besideOf,
  type Month,
  MonthDays,
  type Print,
  roomOf,
  tableOf,
  WEEK,
} from "./month-grid/days";
import { Pointed } from "./month-grid/pointed";
import { varietyFirst } from "./pile";
import { useToday } from "./today-view";

/**
 * A month of a calendar, Monday first; each day shows its prints in a
 * little pile, turned this way and that, now and then over its line
 * (pile.ts). Drawn as a table ruled with a marker: today's number is
 * circled and marked with the calendar's highlighter, the weekend is
 * hatched. The prints bring the color – and with a special one the frame
 * its day gets, in that print's ink. A day with a note has a line of
 * scribbled writing at its foot; the mouse or the keyboard on it hangs the
 * note's start from it (`NameTag`).
 *
 * Its parts lie in month-grid/: the days (days.tsx) with what the marker
 * adds to them (marks.tsx), the way a month turns in (turns.ts) and the
 * blob under the pointer (pointed.tsx).
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
  const { placements, stamps, notes } = useBoop();
  const today = useToday();

  // Each day's prints, top first – different stamps before a second print
  // of one already there: should not all fit, a busy day shows its variety.
  const byDay = useMemo(() => {
    const days = new Map<DayKey, Print[]>();
    for (const p of Object.values(placements)) {
      if (p.calendar !== calendar) continue;
      const stamp = stamps[p.stamp];
      const print = {
        id: p.id,
        z: p.z,
        ink: p.ink ?? stamp?.color ?? "red",
        stamp,
        special: Boolean(stamp?.drawing?.special),
      };
      days.set(p.date, [...(days.get(p.date) ?? []), print]);
    }
    for (const [date, day] of days) {
      day.sort((a, b) => b.z - a.z);
      days.set(
        date,
        varietyFirst(day, (p) => `${p.stamp?.id}:${p.ink}`)
      );
    }
    return days;
  }, [placements, stamps, calendar]);

  // The days with a note – their start, on one line (checked once more).
  const noted = useMemo(() => {
    const days = new Map<DayKey, string>();
    for (const note of Object.values(notes)) {
      if (note.calendar !== calendar) continue;
      const start = notePreview(cleanNote(note.content));
      if (start) days.set(note.date, start);
    }
    return days;
  }, [notes, calendar]);

  const shift = (by: number) => onMonth(besideOf(month, by));
  const now = new Date();
  const thisMonth =
    now.getFullYear() === month.year && now.getMonth() === month.month;
  // How many weeks the table rules – the cells before and after the month
  // hold the days around it.
  const { rows } = tableOf(month);
  // Which way the months went – the new one turns in from that side.
  const index = month.year * 12 + month.month;
  const [turn, setTurn] = useState({ index, dir: 0 });
  if (turn.index !== index) {
    setTurn({ index, dir: Math.sign(index - turn.index) });
  }
  const dir = turn.index === index ? turn.dir : Math.sign(index - turn.index);
  const table = useRef<HTMLDivElement>(null);

  // The days hold on to these – the same ones from render to render.
  const latest = useRef({ onDay, onMonth });
  useLayoutEffect(() => {
    latest.current = { onDay, onMonth };
  });
  const openDay = useCallback((day: DayKey) => latest.current.onDay(day), []);
  const openMonth = useCallback((at: Month) => latest.current.onMonth(at), []);

  // How large a day is – the room its prints have goes by it. Measured
  // before it shows, and again as the room changes; from `sm` on the days'
  // padding and numbers are larger.
  const [cell, setCell] = useState({ size: 0, wide: false });
  useLayoutEffect(() => {
    const box = table.current;
    if (!box) return;
    const wide = window.matchMedia("(min-width: 40rem)");
    const measure = () => {
      const next = { size: box.clientWidth / WEEK, wide: wide.matches };
      setCell((was) =>
        Math.abs(was.size - next.size) < 0.5 && was.wide === next.wide
          ? was
          : next
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    wide.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      wide.removeEventListener("change", measure);
    };
  }, []);
  const rooms = useMemo(
    () => ({
      day: roomOf(cell.size, cell.wide, false),
      today: roomOf(cell.size, cell.wide, true),
    }),
    [cell]
  );

  return (
    <div>
      {/* Nothing in this row changes size from month to month: on a phone
          the year has a line of its own under the month, always – a name
          that wraps only sometimes would make everything beside it jump. */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <m.h2
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          className="min-w-0 origin-left text-2xl leading-none max-[379px]:text-xl sm:text-3xl"
          initial={{ opacity: 0, x: dir * 18, rotate: dir * -2 }}
          key={index}
          transition={SPRING.bouncy}
        >
          {t.app.months[month.month]}{" "}
          <span className="block font-bold text-lg text-muted sm:inline sm:text-3xl">
            {month.year}
          </span>
        </m.h2>
        <div className="flex shrink-0 gap-1.5 sm:gap-2">
          {!thisMonth && (
            <button
              className={cn(
                buttonClass({ variant: "plain", size: "sm" }),
                "h-10 whitespace-nowrap max-sm:px-3"
              )}
              onClick={() =>
                onMonth({ year: now.getFullYear(), month: now.getMonth() })
              }
              type="button"
            >
              {/* Not “today” – that is a view of its own (view-switch.tsx). */}
              {t.app.view.thisMonth}
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
      <div className="relative isolate" ref={table}>
        {/* On a phone the cells are small: a finer marker, so the lines don't
            outweigh the prints. */}
        <Ruling
          className="[--scribble-width:1.5px] sm:[--scribble-width:2.5px]"
          rows={rows}
          shade={2}
        />
        <Pointed rows={rows} table={table} />
        <MonthDays
          byDay={byDay}
          dir={dir}
          locale={locale}
          month={month}
          noted={noted}
          onDay={openDay}
          onMonth={openMonth}
          rooms={rooms}
          today={today}
        />
      </div>
    </div>
  );
};
