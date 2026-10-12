"use client";

import { useEffect, useState } from "react";
import type { Snapshot } from "valtio";
import { type DayKey, type StampDoc, todayKey } from "@/features/calendar/model";
import type { Locale } from "@/i18n/config";
import { DayNote } from "./day-note";
import { DayPage } from "./day-page";

/**
 * Today's date – and the next one's, once midnight has passed: with the
 * app open (a timer for just after it), or asleep in the background
 * meanwhile (looked at again as it comes back).
 */
export const useToday = (): DayKey => {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = () => {
      setToday(todayKey());
      clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1
      );
      timer = setTimeout(look, midnight.getTime() - now.getTime() + 1000);
    };
    const back = () => {
      if (document.visibilityState === "visible") look();
    };
    look();
    document.addEventListener("visibilitychange", back);
    window.addEventListener("pageshow", back);
    window.addEventListener("focus", back);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("pageshow", back);
      window.removeEventListener("focus", back);
    };
  }, []);
  return today;
};

/**
 * A calendar's today: the day's page right in the app – the one the day's
 * sheet has (day-page.tsx), to stamp on at once – and the day's note under
 * it. Only ever today: past midnight the next day's page comes in; the
 * days before are in the month.
 *
 * `keyboard`: the page's keys (day-page.tsx) – off while something lies
 * over it.
 */
export const TodayView = ({
  calendar,
  locale,
  stamps,
  keyboard,
}: {
  calendar: string;
  locale: Locale;
  stamps: readonly Snapshot<StampDoc>[];
  keyboard: boolean;
}) => {
  const today = useToday();
  const date = new Date(`${today}T12:00:00`);
  return (
    // A little wider than the day's sheet, not as wide as the calendar's
    // page: that square would be taller than most screens.
    <div className="mx-auto flex w-full max-w-136 flex-col gap-4">
      <h3 className="text-3xl leading-none">
        {date.toLocaleDateString(locale, { weekday: "long" })}{" "}
        <span className="font-bold text-muted">
          {date.toLocaleDateString(locale, { day: "numeric", month: "long" })}
        </span>
      </h3>
      {/* A new day is a new page: what was in hand, picked or to be taken
          back stays with the day before. */}
      <div className="flex animate-fade flex-col gap-4" key={today}>
        <DayPage
          calendar={calendar}
          date={today}
          keyboard={keyboard}
          locale={locale}
          stamps={stamps}
        />
        <DayNote calendar={calendar} date={today} locale={locale} />
      </div>
    </div>
  );
};
