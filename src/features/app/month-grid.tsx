"use client";

import { AnimatePresence, m, type Variants } from "motion/react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Sparkle } from "@/components/doodles";
import { SPRING } from "@/components/motion";
import { Ruling } from "@/components/ruling";
import { buttonClass, ROUND_BUTTON } from "@/components/ui";
import { type DayKey, todayKey } from "@/features/calendar/model";
import { cleanNote, notePreview } from "@/features/calendar/note";
import { hexOf } from "@/features/calendar/palette";
import { Glitter, StampSvg } from "@/features/calendar/stamp-svg";
import { useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { seedOf } from "./day-sheet";
import { NameTag } from "./name-tag";

type Month = { year: number; month: number };

const key = (year: number, month: number, day: number): DayKey =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/**
 * A day in the ruled month: no frame of its own (the table's lines are the
 * month's, `Ruling`) – the focus ring inside its lines. The soft blob under
 * the pointer is the table's, one for all its days (`Pointed`).
 */
const DAY =
  "scribble scribble-bare scribble-clear scribble-sm relative flex aspect-square min-h-0 flex-col rounded-xl p-1 text-left [--scribble-ring:5px] sm:p-2";

/** The table's columns – a week, Monday first. */
const WEEK = 7;

/**
 * The soft blob under the pointer – one for the whole table, lying under its
 * days: it comes up where the pointer comes in, glides along from day to day
 * and fades once the pointer is gone; pressed, it gives a little. A finger
 * doesn't hover: there it shows only while a day is pressed.
 *
 * A thin wash of the pencil's tone rather than paper grey itself: on the
 * paper it comes out as that grey, and on the weekend's wash – nearly that
 * grey already – a shade darker. On a calendar's own paper (`PAPER`,
 * calendar/tint.ts) the pencil is in its color, and so is the blob.
 *
 * It keeps the pointer's place to itself, so a month's days and prints
 * aren't drawn again as the pointer wanders, and listens on the table it
 * lies in. Days are told by where the pointer is, not by which one it
 * entered: the blob stays put while a month turns in under it.
 */
const Pointed = ({
  rows,
  table,
}: {
  rows: number;
  table: RefObject<HTMLElement | null>;
}) => {
  const [cell, setCell] = useState<number | null>(null);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    const box = table.current;
    if (!box) return;
    /** The cell under the pointer – they are all the same size. */
    const cellAt = (event: PointerEvent) => {
      const { left, top, width, height } = box.getBoundingClientRect();
      const col = Math.floor(((event.clientX - left) / width) * WEEK);
      const row = Math.floor(((event.clientY - top) / height) * rows);
      const inside = col >= 0 && col < WEEK && row >= 0 && row < rows;
      return inside ? row * WEEK + col : null;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "touch") setCell(cellAt(event));
    };
    const down = (event: PointerEvent) => {
      setCell(cellAt(event));
      setPressed(true);
    };
    const up = (event: PointerEvent) => {
      setPressed(false);
      if (event.pointerType === "touch") setCell(null);
    };
    const leave = () => {
      setPressed(false);
      setCell(null);
    };
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerdown", down);
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", leave);
    box.addEventListener("pointerleave", leave);
    return () => {
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointerdown", down);
      box.removeEventListener("pointerup", up);
      box.removeEventListener("pointercancel", leave);
      box.removeEventListener("pointerleave", leave);
    };
  }, [rows, table]);

  // A shorter month may have turned in – its table ends sooner.
  const at = cell !== null && cell < rows * WEEK ? cell : null;
  // In its own widths: a day is one wide, one high.
  const place = at !== null && {
    x: `${(at % WEEK) * 100}%`,
    y: `${Math.floor(at / WEEK) * 100}%`,
  };

  return (
    <AnimatePresence>
      {place && (
        <m.span
          animate={{ ...place, opacity: 1, scale: pressed ? 0.9 : 1 }}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 flex aspect-square w-1/7 will-change-transform"
          exit={{
            opacity: 0,
            scale: 0.8,
            transition: { duration: 0.16, ease: "easeIn" },
          }}
          // Where the pointer came in – it doesn't glide there from afar.
          initial={{ ...place, opacity: 0, scale: 0.8 }}
          key="blob"
          transition={{ ...SPRING.soft, opacity: { duration: 0.14 } }}
        >
          <span className="scribble scribble-bare scribble-sm flex-1 rounded-xl [--scribble-fill:color-mix(in_oklab,var(--color-line)_40%,transparent)] [--scribble-inset:4px]" />
        </m.span>
      )}
    </AnimatePresence>
  );
};

/**
 * Once round a day by hand, in a box of 100 – the marker sets off and ends
 * in the corner the day's number sits in.
 */
const FRAME =
  "M17 3C38 1.2 62 4.2 83 2.6C92 2 97.8 7.5 97.4 17C99 39 96 61 97.6 83C98 92.5 92.5 97.8 83 97.5C61 99 39 96 17 97.6C7.5 98 2.2 92.5 2.6 83C1 61 4.2 39 2.4 17C2 7.5 7.5 2.4 17 3Z";

/**
 * All of a day's frame but the number's corner – in the number's own size
 * (em), so the gap fits it in the smallest day and the largest.
 */
const OPEN =
  "polygon(1.8em -50%, 150% -50%, 150% 150%, -50% 150%, -50% 1.6em, 1.8em 1.6em)";

/**
 * A day a special stamp was pressed on gets a frame of its own: the marker
 * went round it once more, inside the table's lines and in that print's ink
 * – open where the number is, a sparkle on the corner across and a small
 * one down left (where the number and, on a phone, the count aren't). It
 * lies under the day's prints: they are stamped over it, none is covered.
 * The keyboard's dashed ring runs along it, black on its line – further in
 * it would go through the number.
 */
const Special = ({ hex, wave }: { hex: string; wave: Turn }) => (
  <m.span
    aria-hidden="true"
    // The number's size, for the gap.
    className="pointer-events-none absolute inset-[3px] -z-10 text-[11px] sm:inset-1 sm:text-sm"
    custom={wave}
    style={{ color: hex }}
    variants={FRAME_TURN}
  >
    <span className="absolute inset-0" style={{ clipPath: OPEN }}>
      <svg
        aria-hidden="true"
        className="h-full w-full overflow-visible stroke-2 sm:stroke-[2.5]"
        fill="none"
        preserveAspectRatio="none"
        stroke="currentColor"
        strokeLinejoin="round"
        viewBox="0 0 100 100"
      >
        <path d={FRAME} vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
    {/* On the line, a little inside its corners – clear of the table's. */}
    <Sparkle className="absolute top-[10%] right-[10%] h-2.5 w-2.5 translate-x-1/2 -translate-y-1/2 rotate-12 sm:top-[9%] sm:right-[9%] sm:h-5 sm:w-5" />
    <Sparkle className="absolute bottom-[7%] left-[7%] h-2 w-2 -translate-x-1/2 translate-y-1/2 -rotate-12 sm:h-3 sm:w-3" />
  </m.span>
);

/**
 * Two words of scribbled writing – not letters, what handwriting looks like
 * from a little way off: humps, a loop, a gap. Drawn once, in a box of
 * 46 × 8.
 */
const WRITING = [
  "M1 6.5C2 6.5 2.4 3 3.4 3S4.3 6.5 5.3 6.5 6.4 2.6 7.4 2.6 8.2 6.5 9.2 6.5 10.3 3.6 11.2 3.6 11.8 6.5 12.8 6.5 14.4 0.8 15.3 0.8 15.6 4.6 14.6 5.6 15.6 6.6 16.8 6.6 17.8 3.6 18.8 3.6 19.3 6.5 20.4 6.4",
  "M25.2 6.5C26.2 6.5 26.6 3.2 27.6 3.2S28.4 6.5 29.4 6.5 30.4 3 31.4 3 32 6.5 33 6.5 34.6 1.2 35.5 1.2 35.7 5 34.8 5.8 35.8 6.6 37 6.6 38 3.4 39 3.4 39.6 6.5 40.6 6.5 42 4.4 43 4.6 43.4 6.2 45 6",
];

/**
 * A day with a note: a line of scribbled writing along its foot, in the
 * marker's ink – what is written shows on the day's sheet, this only says
 * that something is. It lies under the day's prints like the special frame:
 * they are stamped over it, none is covered. On the left, clear of the
 * frame's sparkle on a special day; on a phone one word only, clear of the
 * count in the other corner.
 */
const Writing = ({ special, wave }: { special: boolean; wave: Turn }) => (
  <m.svg
    aria-hidden="true"
    className={cn(
      "pointer-events-none absolute bottom-1 -z-10 aspect-46/8 h-1.5 overflow-visible stroke-[1.25] sm:bottom-2 sm:h-2.5 sm:stroke-[1.6]",
      special ? "left-2.5 sm:left-6" : "left-1 sm:left-2"
    )}
    custom={wave}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    variants={FRAME_TURN}
    viewBox="0 0 46 8"
  >
    <path d={WRITING[0]} vectorEffect="non-scaling-stroke" />
    <path
      className="max-sm:hidden"
      d={WRITING[1]}
      vectorEffect="non-scaling-stroke"
    />
  </m.svg>
);

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

/** A special day's frame – and a note's writing – show once the prints landed. */
const FRAME_TURN: Variants = {
  hidden: { opacity: 0 },
  shown: ({ order }: Turn) => ({
    opacity: 1,
    transition: { duration: 0.3, delay: order * 0.022 + 0.3 },
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
 * table ruled with a marker: today's number is circled and marked with the
 * calendar's highlighter, the weekend is hatched. The prints bring the color
 * – and with a special one the frame its day gets, in that print's ink. A
 * day with a note has a line of scribbled writing at its foot; the mouse or
 * the keyboard on it hangs the note's start from it (`NameTag`).
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
  const table = useRef<HTMLDivElement>(null);

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
      <div className="relative isolate" ref={table}>
        {/* On a phone the cells are small: a finer marker, so the lines don't
            outweigh the prints. */}
        <Ruling
          className="[--scribble-width:1.5px] sm:[--scribble-width:2.5px]"
          rows={rows}
          shade={2}
        />
        <Pointed rows={rows} table={table} />
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
              const big = day.find((p) => stamps[p.stamp]?.drawing?.special);
              const note = noted.get(date);
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
                      {big && (
                        <Special
                          hex={hexOf(
                            big.ink ?? stamps[big.stamp]?.color ?? "red"
                          )}
                          wave={wave}
                        />
                      )}
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
                          "font-black text-[11px] leading-none sm:text-sm",
                          // Today: circled, and marked with the highlighter in
                          // the calendar's color (`--cal-mark`, calendar/tint.ts)
                          // – paper grey where none is set. The circle reaches
                          // over the number's line – the prints below keep
                          // their room.
                          isToday &&
                            "scribble scribble-sm scribble-thin -my-[0.4em] -ml-[0.3em] flex h-[2.1em] w-[2.1em] shrink-0 items-center justify-center self-start rounded-full [--scribble-fill:var(--cal-mark,var(--color-soft))]"
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
                          day.length === 1 ? "grid-cols-1" : "grid-cols-2",
                          // Clear of the frame's line – a big print reaches it.
                          big && "mx-0.5 mb-0.5"
                        )}
                        custom={wave}
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
      </div>
    </div>
  );
};
