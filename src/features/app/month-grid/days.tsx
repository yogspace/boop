"use client";

import { AnimatePresence, m } from "motion/react";
import { memo } from "react";
import type { Snapshot } from "valtio";
import { ArrowLeft, ArrowRight } from "@/components/doodles";
import type { ColorName, DayKey, StampDoc } from "@/features/calendar/model";
import { hexOf } from "@/features/calendar/palette";
import { Glitter, StampSvg } from "@/features/calendar/stamp-svg";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { seedOf } from "../day-sheet";
import { NameTag } from "../name-tag";
import { layoutPrints, type Room } from "../pile";
import { Special, Writing } from "./marks";
import { DAY_TURN, MONTH_TURN, orderOf, PRINT_TURN } from "./turns";

/**
 * The days in the ruled table of a month (month-grid.tsx): each with its
 * number and its prints in a little pile (pile.ts), and the days of the
 * months around it in the cells before and after.
 */

export type Month = { year: number; month: number };

/** A print on a day of the month – what its pile needs (pile.ts). */
export type Print = {
  id: string;
  z: number;
  ink: ColorName;
  stamp: Snapshot<StampDoc> | undefined;
  special: boolean;
};

const key = (year: number, month: number, day: number): DayKey =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** The table's columns – a week, Monday first. */
export const WEEK = 7;

/** The month `by` months on from this one (back, when less than 0). */
export const besideOf = ({ year, month }: Month, by: number): Month => {
  const next = new Date(year, month + by, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
};

/**
 * How a month lies in the table: the cells before its first (a Monday
 * first), its length – and how many weeks the table rules; the cells after
 * it hold the days of the next.
 */
export const tableOf = ({ year, month }: Month) => {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const length = new Date(year, month + 1, 0).getDate();
  return { offset, length, rows: Math.ceil((offset + length) / 7) };
};

/**
 * A day in the ruled month: no frame of its own (the table's lines are the
 * month's, `Ruling`) – the focus ring inside its lines. The soft blob under
 * the pointer is the table's, one for all its days (pointed.tsx).
 */
const DAY =
  "scribble scribble-bare scribble-clear scribble-sm relative flex aspect-square min-h-0 flex-col rounded-xl p-1 text-left [--scribble-ring:5px] sm:p-2";

/**
 * A day on a phone and from `sm` on: its padding (`DAY`), its number's size
 * and the corner “+n” takes (px) – and for its prints, how far one may
 * reach over its line and how small one may get.
 */
const NARROW = {
  inset: 4,
  font: 11,
  badge: { width: 19, height: 16 },
  over: 3,
  smallest: 13,
};
const WIDE = {
  inset: 8,
  font: 14,
  badge: { width: 30, height: 21 },
  over: 5,
  smallest: 20,
};

/**
 * “+n”, in the corner kept for it (`badge` above): the calendar's ink on its
 * paper (calendar/tint.ts – 6.8:1 and more, on the wash too).
 */
const MORE =
  "absolute right-0.5 bottom-0.5 z-10 rounded-full bg-(--cal-soft,var(--color-card)) px-0.5 font-black text-[10px] text-(--cal-ink,var(--color-ink)) leading-3.5 sm:right-1 sm:bottom-1 sm:px-1 sm:text-xs sm:leading-4";

/**
 * The room a day of `size` has for its pile of prints (pile.ts). The corner
 * its number takes is kept clear – today's circle takes more of it – and,
 * when not all fit, the one for “+n”.
 */
export const roomOf = (size: number, wide: boolean, today: boolean): Room => {
  const { inset, font, badge, over, smallest } = wide ? WIDE : NARROW;
  return {
    width: size,
    height: size,
    inset,
    over,
    corner: today
      ? { width: inset + 1.8 * font, height: inset + 1.7 * font }
      : { width: inset + 1.7 * font, height: inset + 1.25 * font },
    badge,
    smallest,
    biggest: size * 0.6,
    most: 16,
  };
};

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
      className={cn(DAY, "group")}
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
 * A month's days, turning in as it comes (turns.ts): each day a button that
 * opens it, its number – today's circled and marked with the calendar's
 * highlighter – and its prints in a little pile; a special day framed, a
 * day with a note written on (marks.tsx), and that note's start hung from
 * it when the mouse or the keyboard is on it (`NameTag`).
 *
 * Drawn again only when what it shows changes – not as the app around it
 * is: `onDay` and `onMonth` are to stay the same from render to render.
 */
export const MonthDays = memo(function MonthDays({
  month,
  dir,
  locale,
  today,
  byDay,
  noted,
  rooms,
  onDay,
  onMonth,
}: {
  month: Month;
  /** Which way the months went – the new one turns in from that side. */
  dir: number;
  locale: Locale;
  today: DayKey;
  /** Each day's prints, in the order they get room (pile.ts). */
  byDay: ReadonlyMap<DayKey, Print[]>;
  /** The days with a note – its start, on one line. */
  noted: ReadonlyMap<DayKey, string>;
  rooms: { day: Room; today: Room };
  onDay: (day: DayKey) => void;
  onMonth: (month: Month) => void;
}) {
  const t = dictionaryOf(locale);
  const { offset, length, rows } = tableOf(month);
  const before = besideOf(month, -1);
  const after = besideOf(month, 1);
  const lengthBefore = new Date(month.year, month.month, 0).getDate();
  const index = month.year * 12 + month.month;
  const labelOf = ({ year, month }: Month) => `${t.app.months[month]} ${year}`;

  return (
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
          // Its place in the wave the days come in with.
          const wave = { dir, order: orderOf(offset + i, dir) };
          // A special stamp's print makes the day special – the top one
          // lends the frame its ink.
          const big = day.find((p) => p.special);
          const note = noted.get(date);
          const pile = layoutPrints(
            day,
            isToday ? rooms.today : rooms.day,
            date
          );
          return (
            <NameTag id={`note-${date}`} key={date} text={note ?? ""}>
              {(anchor) => (
                <m.button
                  aria-current={isToday ? "date" : undefined}
                  className={DAY}
                  custom={wave}
                  onBlur={anchor.onBlur}
                  onClick={() => {
                    anchor.onClick();
                    onDay(date);
                  }}
                  onFocus={anchor.onFocus}
                  onPointerEnter={anchor.onPointerEnter}
                  onPointerLeave={anchor.onPointerLeave}
                  style={anchor.style}
                  type="button"
                  variants={DAY_TURN}
                >
                  {big && <Special hex={hexOf(big.ink)} wave={wave} />}
                  {note && (
                    <>
                      <Writing special={Boolean(big)} wave={wave} />
                      <span className="sr-only">
                        {t.app.note.inMonth}: {note}
                      </span>
                    </>
                  )}
                  <span
                    className={cn(
                      // Over the prints – they keep clear of its corner, and
                      // should one reach in, it is stamped under it.
                      "relative z-10 font-black text-[11px] leading-none sm:text-sm",
                      // Today: circled, and marked with the highlighter in
                      // the calendar's color (`--cal-mark`, calendar/tint.ts)
                      // – paper grey where none is set. The circle reaches
                      // over the number's line; the prints keep clear of it
                      // (`roomOf`).
                      isToday &&
                        "scribble scribble-sm scribble-thin -my-[0.4em] -ml-[0.3em] flex h-[2.1em] w-[2.1em] shrink-0 items-center justify-center self-start rounded-full [--scribble-fill:var(--cal-mark,var(--color-soft))]"
                    )}
                  >
                    {i + 1}
                  </span>
                  {/* The day's prints in a little pile, each where pile.ts
                      lays it: the more, the smaller – overlapping, a few a
                      little over the day's line. Each mixes with what it
                      lies on, like ink. */}
                  <m.span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    custom={wave}
                    variants={PRINT_TURN}
                  >
                    {pile.laid.map(({ print: p, x, y, size, turn }) => (
                      <span
                        className="absolute mix-blend-multiply"
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
                        {/* A special one: a few sparkles that hold still –
                            a month has many days. */}
                        {p.special && p.stamp?.drawing && (
                          <Glitter
                            color={p.ink}
                            drawing={p.stamp.drawing}
                            seed={seedOf(p.id)}
                            shape={p.stamp.shape}
                            still
                          />
                        )}
                      </span>
                    ))}
                  </m.span>
                  {/* Only when even the smallest won't fit: how many more,
                      quietly – written in the calendar's ink on a patch of
                      its paper (only the weekend's wash shows it). */}
                  {pile.more > 0 && <span className={MORE}>+{pile.more}</span>}
                </m.button>
              )}
            </NameTag>
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
  );
});
