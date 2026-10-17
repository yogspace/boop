"use client";

import { m } from "motion/react";
import { useMemo } from "react";
import { SPRING } from "@/components/motion";
import { useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { calendarOf, opensHere, readAddress, slugsOf } from "./address";
import { SIGNPOST } from "./stamp-pile";
import { useToday } from "./today-view";

/** The leaf as set down (`rest`) and lifted a little (`fanned`). */
const LIFT = {
  rest: { y: 0, rotate: -6 },
  fanned: { y: -3, rotate: 3 },
};

/**
 * The way back from the shelf (stamp-shelf.tsx) to the calendar shown last,
 * in its view – the stamp pile's counterpart (stamp-pile.tsx), in its place
 * and its size: going from one page to the other, the button stays where it
 * is. A leaf of a calendar, drawn by hand and set down a little askew – its
 * rings on top, the month over today's date, tinted like the calendar
 * (`--cal-mark`, `--cal-soft`: the frame around has its shades) – and under
 * it, small, the calendar's name; on the same soft paper as the pile
 * (`SIGNPOST`). Pointed at or focused, the leaf lifts and turns a little.
 *
 * A link to that calendar's address (`href`), followed in place (`onOpen`)
 * – a new tab or window gets the address itself. Which calendar it is, the
 * address says, as it does to the app (address.ts).
 */
export const CalendarLeaf = ({
  href,
  me,
  locale,
  onOpen,
}: {
  href: string;
  me: string | undefined;
  locale: Locale;
  onOpen: () => void;
}) => {
  const t = dictionaryOf(locale);
  const { calendars } = useBoop();
  const name = useMemo(() => {
    const slugs = slugsOf(Object.values(calendars), me, locale);
    const id = calendarOf(readAddress(href).calendar, slugs);
    return (id && calendars[id]?.name) || "";
  }, [calendars, me, locale, href]);
  const today = useToday();
  const month = t.app.months[Number(today.slice(5, 7)) - 1] ?? "";
  return (
    <m.a
      animate="rest"
      aria-label={name ? t.app.backToCalendar(name) : t.app.backToCalendars}
      className={cn(
        "group flex shrink-0 flex-col items-center gap-1.5",
        SIGNPOST
      )}
      href={href}
      initial={false}
      onClick={(event) => {
        if (!opensHere(event)) return;
        event.preventDefault();
        onOpen();
      }}
      whileFocus="fanned"
      whileHover="fanned"
    >
      <span className="relative h-14 w-22 sm:h-16 sm:w-26">
        <m.span
          className="absolute inset-0 m-auto h-14 w-13 sm:h-16 sm:w-15"
          transition={SPRING.soft}
          variants={LIFT}
        >
          <Leaf className="absolute inset-0 h-full w-full" />
          <span className="absolute inset-x-0 top-[16%] flex h-[23%] items-center justify-center font-black text-[8px] uppercase leading-none tracking-wide sm:text-[9px]">
            {month.slice(0, 3)}
          </span>
          <span className="absolute inset-x-0 top-[42%] bottom-[4%] flex items-center justify-center font-black text-xl leading-none sm:text-2xl">
            {Number(today.slice(8, 10))}
          </span>
        </m.span>
      </span>
      {/* As wide as the pile's word (stamp-pile.tsx) – a long name is cut. */}
      <span className="flex w-22 justify-center font-bold text-[11px] text-muted leading-none transition-colors group-hover:text-ink sm:w-26 sm:text-xs">
        <span className="max-w-24 shrink-0 truncate sm:max-w-28">
          {name || t.app.backToCalendars}
        </span>
      </span>
    </m.a>
  );
};

/**
 * A calendar's leaf, by hand (48 × 52): its paper, a band of highlighter
 * over it for the month, the marker round it all and two rings at the top.
 */
const Leaf = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="var(--color-ink)"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 48 52"
  >
    <path
      d="M9 7.4C18 6.4 30 7 39.4 6.6C42.2 6.6 43.4 8.4 43.2 11.2C43.6 22 42.8 35 43.4 45.4C43.4 48.2 41.6 49.8 38.8 49.6C29 50.2 18 49.4 9.2 50C6.4 50 4.8 48.4 5 45.6C4.6 35 5.4 22 4.8 11.4C4.8 8.6 6.4 7.2 9 7.4Z"
      fill="var(--cal-soft, var(--color-card))"
      stroke="none"
    />
    <path
      d="M9 7.4C18 6.4 30 7 39.4 6.6C42.2 6.6 43.4 8.4 43.2 11.2L43.1 21.6C31 21 17 22.2 4.9 21.8L4.8 11.4C4.8 8.6 6.4 7.2 9 7.4Z"
      fill="var(--cal-mark, var(--color-soft))"
      stroke="none"
    />
    <path d="M5 21.8C17 22.2 31 21 43.1 21.6" strokeWidth="2" />
    <path
      d="M9 7.4C18 6.4 30 7 39.4 6.6C42.2 6.6 43.4 8.4 43.2 11.2C43.6 22 42.8 35 43.4 45.4C43.4 48.2 41.6 49.8 38.8 49.6C29 50.2 18 49.4 9.2 50C6.4 50 4.8 48.4 5 45.6C4.6 35 5.4 22 4.8 11.4C4.8 8.6 6.4 7.2 9 7.4Z"
      strokeWidth="2.6"
    />
    <path d="M15.5 2.4v7.6M32.5 2.2v7.6" strokeWidth="3.2" />
  </svg>
);
