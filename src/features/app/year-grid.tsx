"use client";

import { m } from "motion/react";
import {
  type KeyboardEvent,
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Snapshot } from "valtio";
import { ArrowLeft, ArrowRight } from "@/components/doodles";
import { SPRING } from "@/components/motion";
import { Ruling } from "@/components/ruling";
import { buttonClass, ROUND_BUTTON } from "@/components/ui";
import type { ColorName, DayKey, StampDoc } from "@/features/calendar/model";
import { StampSvg } from "@/features/calendar/stamp-svg";
import { useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { seedOf } from "./day-page";
import { layoutPrints, type Room, varietyFirst } from "./pile";
import { useToday } from "./today-view";
import { keyOf, stepOf } from "./year-keys";

type Month = { year: number; month: number };

type Print = {
  id: string;
  z: number;
  ink: ColorName;
  stamp: Snapshot<StampDoc> | undefined;
  special: boolean;
};

/**
 * What a day's cell shows: its prints, top first (different stamps before
 * a second print of one already there) – and whether a note.
 */
type Day = { prints: Print[]; note: boolean };

const DAYS = 31;

/** The days' numbers down the left (px – the cells' widths are worked out). */
const NUMBERS = 24;

/**
 * How the table is measured out, from its width: how wide a month's column
 * is, how high a day's row – high enough for one print to be made out, a
 * little higher where the columns are wide – and the room a day's prints
 * have there (pile.ts): a few, overlapping, never smaller than this; a
 * hair over the day's line at most – the rows are close.
 */
const layoutOf = (width: number) => {
  const column = Math.max(0, (width - NUMBERS) / 12);
  const row = column >= 40 ? 28 : 24;
  const room: Room = {
    width: column,
    height: row,
    inset: 1,
    over: 1.5,
    // Where “+n” is, when not all fit.
    badge: { width: 16, height: 11 },
    smallest: 13,
    biggest: row - 4,
    most: 8,
  };
  return { column, row, room };
};

type Layout = ReturnType<typeof layoutOf>;

/**
 * The year as one table, ruled with the marker like the month: a column per
 * month (their names on top), a row per day (the numbers down the left).
 * A stamped day shows its prints in a little pile like the month's, each a
 * little turned and off its place – smaller and overlapping the more there
 * are, up to eight (“+3” for the rest); on a phone, where the columns are
 * narrow, four (pile.ts). So the year grows colorful as it
 * fills, and the table itself stays quiet: days a month doesn't have are
 * hatched, the weekend washed, today marked with the calendar's
 * highlighter, a day with a note gets a little stroke of writing.
 *
 * A month's name opens that month, a day its sheet; the arrows go from year
 * to year. The ruling stays as it is from year to year – only the months
 * come anew; a month whose days didn't change isn't drawn again.
 *
 * The keyboard: the months' names are stops of their own, the days one
 * stop for all – today, or the day last been on. In the table the arrows
 * go on from there (`stepOf`, year-keys.ts): ↑ ↓ a day back or on (past a
 * month's end into the next), ← → a month, on the same day where it has one
 * (else its last); Home and End the month's first and last. Enter opens
 * the day.
 */
export const YearGrid = ({
  calendar,
  locale,
  year,
  onYear,
  onMonth,
  onDay,
}: {
  calendar: string;
  locale: Locale;
  year: number;
  onYear: (year: number) => void;
  onMonth: (month: Month) => void;
  onDay: (day: DayKey) => void;
}) => {
  const t = dictionaryOf(locale);
  const { placements, stamps, notes } = useBoop();
  const today = useToday();
  const thisYear = Number(today.slice(0, 4));

  // Each month's days: their prints, top first (the highest, as on the
  // month), and whether there is a note. A month whose days didn't change
  // keeps its map, and so isn't drawn again.
  const kept = useRef<Map<DayKey, Day>[]>([]);
  const months = useMemo(() => {
    const all = Array.from({ length: 12 }, () => new Map<DayKey, Day>());
    const prefix = `${year}-`;
    const dayOf = (date: DayKey) => {
      const days = all[Number(date.slice(5, 7)) - 1];
      let day = days.get(date);
      if (!day) {
        day = { prints: [], note: false };
        days.set(date, day);
      }
      return day;
    };
    for (const p of Object.values(placements)) {
      if (p.calendar !== calendar || !p.date.startsWith(prefix)) continue;
      const stamp = stamps[p.stamp];
      dayOf(p.date).prints.push({
        id: p.id,
        z: p.z,
        ink: p.ink ?? stamp?.color ?? "red",
        stamp,
        special: Boolean(stamp?.drawing?.special),
      });
    }
    for (const note of Object.values(notes ?? {})) {
      if (note.deleted || !note.content) continue;
      if (note.calendar !== calendar || !note.date.startsWith(prefix)) continue;
      dayOf(note.date).note = true;
    }
    for (const days of all) {
      for (const day of days.values()) {
        day.prints = varietyFirst(
          day.prints.sort((a, b) => b.z - a.z),
          (p) => `${p.stamp?.id}:${p.ink}`
        );
      }
    }
    return all.map((days, i) => {
      const before = kept.current[i];
      return before && same(before, days) ? before : days;
    });
  }, [placements, stamps, notes, calendar, year]);
  useLayoutEffect(() => {
    kept.current = months;
  }, [months]);

  // The months hold on to these – the same ones from render to render.
  const latest = useRef({ onMonth, onDay });
  useLayoutEffect(() => {
    latest.current = { onMonth, onDay };
  });
  const openMonth = useCallback((at: Month) => latest.current.onMonth(at), []);
  const openDay = useCallback((day: DayKey) => latest.current.onDay(day), []);

  // Measured before it shows, and again as the room changes.
  const table = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>(() => layoutOf(0));
  useLayoutEffect(() => {
    const box = table.current;
    if (!box) return;
    const measure = () => {
      const next = layoutOf(box.clientWidth);
      setLayout((was) =>
        Math.abs(was.column - next.column) < 0.5 && was.row === next.row
          ? was
          : next
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Which way the years went – the new one comes in from that side.
  const [turn, setTurn] = useState({ year, dir: 0 });
  if (turn.year !== year) setTurn({ year, dir: Math.sign(year - turn.year) });
  const dir = turn.year === year ? turn.dir : Math.sign(year - turn.year);

  const named = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }),
    [locale]
  );

  // The days' one stop for the keyboard: the day last been on, in this
  // year – else today, or the year's first. Only its month hears of it, so
  // a step draws no more than the two months it goes between.
  const [been, setBeen] = useState<DayKey | null>(null);
  const stop =
    been?.startsWith(`${year}-`) === true
      ? been
      : year === thisYear
        ? today
        : keyOf(year, 0, 1);
  const stopMonth = Number(stop.slice(5, 7)) - 1;
  // Whichever day the keyboard – or a tap – comes to is the stop now.
  const visit = useCallback((day: DayKey) => setBeen(day), []);

  /** An arrow, Home or End on a day: on to the next one. */
  const step = useCallback(
    (from: DayKey, event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const to = stepOf(from, event.key);
      if (!to) return;
      event.preventDefault();
      table.current?.querySelector<HTMLElement>(`[data-day="${to}"]`)?.focus();
    },
    []
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <m.h3
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          className="origin-left text-3xl leading-none"
          initial={{ opacity: 0, x: dir * 18, rotate: dir * -2 }}
          key={year}
          transition={SPRING.bouncy}
        >
          {year}
        </m.h3>
        <div className="flex gap-2">
          {year !== thisYear && (
            <button
              className={cn(
                buttonClass({ variant: "plain", size: "sm" }),
                "h-10"
              )}
              onClick={() => onYear(thisYear)}
              type="button"
            >
              {/* Not “today” – that is a view of its own (view-switch.tsx). */}
              {t.app.view.thisYear}
            </button>
          )}
          <button
            aria-label={t.app.view.prevYear}
            className={ROUND_BUTTON}
            onClick={() => onYear(year - 1)}
            type="button"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button
            aria-label={t.app.view.nextYear}
            className={ROUND_BUTTON}
            onClick={() => onYear(year + 1)}
            type="button"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative isolate flex" ref={table}>
        {/* The ruling, over the cells only – names and numbers outside it.
            It stays put from year to year: nothing in it is drawn again. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-6 right-0 bottom-0 z-10"
          style={{ left: NUMBERS }}
        >
          <Ruling className="[--scribble-width:1.5px]" cols={12} rows={DAYS} />
        </span>

        <div
          aria-hidden="true"
          className="flex shrink-0 flex-col font-black text-[9px] text-muted leading-none"
          style={{ width: NUMBERS }}
        >
          <span className="h-6 shrink-0" />
          {Array.from({ length: DAYS }, (_, i) => (
            <span
              className="flex shrink-0 items-center justify-center"
              key={i}
              style={{ height: layout.row }}
            >
              {i + 1}
            </span>
          ))}
        </div>

        {months.map((days, month) => (
          <m.div
            animate={{ opacity: 1, x: 0, y: 0 }}
            className="min-w-0 flex-1"
            initial={{ opacity: 0, x: dir * 8, y: dir ? 0 : 6 }}
            // A year turned: the months come anew, one after the other.
            key={`${year}-${month}`}
            transition={{ ...SPRING.soft, delay: month * 0.018 }}
          >
            <MonthColumn
              days={days}
              layout={layout}
              locale={locale}
              month={month}
              named={named}
              onDay={openDay}
              onKey={step}
              onMonth={openMonth}
              onVisit={visit}
              stop={month === stopMonth ? stop : null}
              today={today}
              year={year}
            />
          </m.div>
        ))}
      </div>
    </div>
  );
};

/** Whether two months' days show the same. */
const same = (a: Map<DayKey, Day>, b: Map<DayKey, Day>) => {
  if (a.size !== b.size) return false;
  for (const [date, day] of b) {
    const was = a.get(date);
    if (
      !was ||
      was.note !== day.note ||
      was.prints.length !== day.prints.length ||
      was.prints.some(
        (p, i) =>
          p.id !== day.prints[i].id ||
          p.ink !== day.prints[i].ink ||
          p.stamp !== day.prints[i].stamp
      )
    ) {
      return false;
    }
  }
  return true;
};

/**
 * A month in the year's table: its short name on top (which opens it),
 * then its days down the column.
 */
const MonthColumn = memo(function MonthColumn({
  year,
  month,
  days,
  today,
  layout,
  locale,
  named,
  onMonth,
  onDay,
  stop,
  onKey,
  onVisit,
}: {
  year: number;
  month: number;
  days: Map<DayKey, Day>;
  today: DayKey;
  layout: Layout;
  locale: Locale;
  named: Intl.DateTimeFormat;
  onMonth: (month: Month) => void;
  onDay: (day: DayKey) => void;
  /** The day of this month that is the keyboard's stop – none: another's. */
  stop: DayKey | null;
  onKey: (day: DayKey, event: KeyboardEvent<HTMLButtonElement>) => void;
  onVisit: (day: DayKey) => void;
}) {
  const t = dictionaryOf(locale);
  const length = new Date(year, month + 1, 0).getDate();
  const { row, room } = layout;
  return (
    <div className="flex flex-col">
      <button
        aria-label={`${t.app.months[month]} ${year}`}
        className="mx-auto flex h-6 shrink-0 items-center rounded-md px-0.5 font-black text-[9px] uppercase leading-none tracking-wide hover:scribble-underline sm:text-[11px]"
        onClick={() => onMonth({ year, month })}
        type="button"
      >
        {t.app.months[month].slice(0, 3)}
      </button>
      {Array.from({ length }, (_, i) => {
        const date = keyOf(year, month, i + 1);
        const day = days.get(date);
        // As large as a row allows, smaller and overlapping the more share
        // the cell – each a little turned and off its place.
        const { laid, more } = layoutPrints(day?.prints ?? [], room, date);
        const weekday = new Date(year, month, i + 1).getDay();
        const label = named.format(new Date(year, month, i + 1));
        return (
          <button
            aria-current={date === today ? "date" : undefined}
            aria-label={label}
            className={cn(
              "relative isolate shrink-0",
              // The weekend's wash – in each column somewhere else.
              (weekday === 0 || weekday === 6) && "bg-soft/70",
              "hover:bg-[color-mix(in_oklab,var(--color-line)_40%,transparent)]",
              // The keyboard's ring inside the day's lines – outside, the
              // days around would cover it.
              "focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-dashed"
            )}
            data-day={date}
            key={date}
            onClick={() => onDay(date)}
            onFocus={() => onVisit(date)}
            onKeyDown={(event) => onKey(date, event)}
            style={{ height: row }}
            // One stop for all the days – the arrows go on from it.
            tabIndex={date === stop ? 0 : -1}
            title={label}
            type="button"
          >
            {date === today && (
              // Today, as on the month: marked with the highlighter.
              <span
                aria-hidden="true"
                className="scribble scribble-bare scribble-sm absolute inset-0.5 -z-10 -rotate-1 rounded-md [--scribble-fill:var(--cal-mark,var(--color-soft))]"
              />
            )}
            {/* A special stamp's print stands out a little: larger, on top
                (pile.ts). */}
            {laid.map(({ print: p, x, y, size, turn }) => (
              <span
                className="pointer-events-none absolute flex mix-blend-multiply"
                key={p.id}
                style={{
                  left: x - size / 2,
                  top: y - size / 2,
                  width: size,
                  height: size,
                  transform: `rotate(${turn}deg)`,
                }}
              >
                <StampSvg
                  className="h-full w-full"
                  color={p.ink}
                  drawing={p.stamp?.drawing ?? null}
                  print
                  seed={seedOf(p.id)}
                  shape={p.stamp?.shape}
                />
              </span>
            ))}
            {more > 0 && (
              // Quietly, as on the month: the calendar's ink on its paper.
              <span className="pointer-events-none absolute right-px bottom-px rounded-full bg-(--cal-soft,var(--color-card)) px-px font-black text-[8px] text-(--cal-ink,var(--color-ink)) leading-2.5">
                +{more}
              </span>
            )}
            {day?.note && <Writing />}
          </button>
        );
      })}
      {length < DAYS && (
        // Days this month doesn't have: hatched over.
        <span
          aria-hidden="true"
          className="scribble-hatch shrink-0 opacity-50"
          style={{ height: (DAYS - length) * row }}
        />
      )}
    </div>
  );
});

/** A day with a note: a little stroke of writing in its corner. */
const Writing = () => (
  <svg
    aria-hidden="true"
    className="pointer-events-none absolute top-0.5 left-0.5 h-1.5 w-3 text-ink"
    fill="none"
    preserveAspectRatio="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.4"
    viewBox="0 0 16 6"
  >
    <path d="M1 4c1.5-3 2.5-3 3 0s1.8 2.6 3-.5 2.4-2.6 3 0 2 2.4 5-1" />
  </svg>
);
