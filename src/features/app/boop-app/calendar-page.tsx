"use client";

import { AnimatePresence, m, type Variants } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import type { Snapshot } from "valtio";
import { SPRING } from "@/components/motion";
import { ROUND_BUTTON } from "@/components/ui";
import type { CalendarDoc, DayKey } from "@/features/calendar/model";
import { PAPER } from "@/features/calendar/tint";
import type { CalendarView } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { PersonPlus, Sliders } from "../calendar-signs";
import type { TrayProps } from "../day-page";
import { MonthGrid } from "../month-grid";
import { NameTag } from "../name-tag";
import { TodayView } from "../today-view";
import { ViewSwitch } from "../view-switch";
import { YearGrid } from "../year-grid";
import { ahead } from "./later";
import { CalendarSettings, ShareSheet, StampDrawer } from "./lazy-sheets";

/**
 * The views take turns quietly: one fades, the other settles in from a
 * little below. Up and down, not sideways – the calendar's page reaches the
 * screen's edges on a phone, and a step aside would take it past them.
 */
export const VIEW_TURN: Variants = {
  hidden: { opacity: 0, y: 10 },
  shown: {
    opacity: 1,
    y: 0,
    transition: { ...SPRING.soft, opacity: { duration: 0.2 } },
  },
  gone: {
    opacity: 0,
    transition: { duration: 0.12, ease: "easeIn" },
  },
};

/** The calendar's own sheets – fetched as one comes to their buttons. */
const sheetsAhead = ahead(ShareSheet, CalendarSettings);
/** The editor – a new stamp from the today view's tray. */
const drawerAhead = ahead(StampDrawer);

/** A month in time – the one the month shows, and whose year the year. */
type Month = { year: number; month: number };

/**
 * The calendar's page: a sheet of paper in a pale shade of its color, cut
 * out by hand – no line around it, the month's ruled table or today's page
 * is the drawing. As wide as the frame; on a phone it reaches into the
 * gutter, so the days stay as large as they were. Another calendar is
 * another sheet (keyed by its id): it comes anew, its days and prints with
 * it.
 *
 * On it: the calendar's name, the views to switch between, its share sheet
 * (its owner's) and its settings – and the view itself.
 */
export const CalendarPage = ({
  locale,
  calendar,
  owner,
  view,
  month,
  tray,
  keyboard,
  onPick,
  onDay,
  onMonth,
  onShare,
  onSettings,
}: {
  locale: Locale;
  calendar: Snapshot<CalendarDoc>;
  /** The account is its owner: sharing is its. */
  owner: boolean;
  view: CalendarView;
  month: Month;
  /** The day's tray, for the today view (`TrayProps`). */
  tray: TrayProps;
  /** The today view's keys – off while something lies over it. */
  keyboard: boolean;
  onPick: (view: CalendarView) => void;
  onDay: (day: DayKey) => void;
  onMonth: (month: Month) => void;
  onShare: () => void;
  onSettings: () => void;
}) => {
  const t = dictionaryOf(locale);
  return (
    <div
      className="relative isolate -mx-3 animate-fade px-3 py-4 sm:mx-0 sm:p-6"
      onPointerEnter={drawerAhead}
      style={PAPER as CSSProperties}
    >
      {/* The paper itself – beside what lies on it, not around it: what a
        frame is told (no line, here) its children hear too. */}
      <span
        aria-hidden="true"
        className="scribble scribble-bare pointer-events-none absolute inset-0 -z-10 rounded-[28px]"
      />
      {/* biome-ignore lint/a11y/noStaticElementInteractions: no interaction – only fetching ahead what its buttons open */}
      <div
        className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-3"
        onFocus={sheetsAhead}
        onPointerEnter={sheetsAhead}
      >
        <h2 className="wrap-break-word min-w-0 flex-1 text-2xl">
          <Marked>{calendar.name}</Marked>
        </h2>
        {/* The views: beside the name – on a phone in a line of their own,
          under it. */}
        <div className="max-sm:order-last max-sm:w-full">
          <ViewSwitch locale={locale} onPick={onPick} view={view} />
        </div>
        {/* Sharing is the owner's – the server lets no one else. */}
        {owner && (
          <NameTag id="share" text={t.app.share.title}>
            {({ onClick, ...anchor }) => (
              <button
                {...anchor}
                aria-label={t.app.share.title}
                className={ROUND_BUTTON}
                onClick={() => {
                  onClick();
                  onShare();
                }}
                type="button"
              >
                <PersonPlus className="h-6 w-6" />
              </button>
            )}
          </NameTag>
        )}
        <NameTag id="settings" text={t.app.settings.title}>
          {({ onClick, ...anchor }) => (
            <button
              {...anchor}
              aria-label={t.app.settings.title}
              className={ROUND_BUTTON}
              onClick={() => {
                onClick();
                onSettings();
              }}
              type="button"
            >
              <Sliders className="h-6 w-6" />
            </button>
          )}
        </NameTag>
      </div>
      <AnimatePresence initial={false} mode="wait">
        <m.div
          animate="shown"
          exit="gone"
          initial="hidden"
          key={view}
          variants={VIEW_TURN}
        >
          {view === "today" && (
            <TodayView
              {...tray}
              calendar={calendar.id}
              keyboard={keyboard}
              locale={locale}
            />
          )}
          {view === "month" && (
            // Its days are square: across the whole sheet they would be
            // taller than the window. In the middle, no wider than six weeks
            // fit under the sheet's top (12rem) – nor 56rem, nor under 36rem.
            <div className="mx-auto max-w-[min(56rem,max(36rem,calc((100dvh-12rem)*7/6)))]">
              <MonthGrid
                calendar={calendar.id}
                locale={locale}
                month={month}
                onDay={onDay}
                onMonth={onMonth}
              />
            </div>
          )}
          {view === "year" && (
            // The year of the month that shows – one place in time for both:
            // a year picked here, the month opens in it.
            <YearGrid
              calendar={calendar.id}
              locale={locale}
              onDay={onDay}
              onMonth={(at) => {
                onMonth(at);
                onPick("month");
              }}
              onYear={(year) => onMonth({ year, month: month.month })}
              year={month.year}
            />
          )}
        </m.div>
      </AnimatePresence>
    </div>
  );
};

/**
 * Words marked with the highlighter – in the calendar's color (`--cal-mark`,
 * always light enough for ink on it). The stroke lies a little askew behind
 * them, as drawn by hand.
 */
const Marked = ({ children }: { children: ReactNode }) => (
  <span className="relative isolate -mx-1.5 inline-block max-w-full px-1.5">
    <span
      aria-hidden="true"
      className="scribble scribble-bare scribble-sm absolute inset-x-0 inset-y-0.5 -z-10 -rotate-1 rounded-lg [--scribble-fill:var(--cal-mark)]"
    />
    {children}
  </span>
);
