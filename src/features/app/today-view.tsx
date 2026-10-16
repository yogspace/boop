"use client";

import { useEffect, useState } from "react";
import { type DayKey, todayKey } from "@/features/calendar/model";
import type { Locale } from "@/i18n/config";
import { DayNote } from "./day-note";
import { DayPage, type TrayProps } from "./day-page";

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
 * the page. Only ever today: past midnight the next day's page comes in; the
 * days before are in the month.
 *
 * `keyboard`: the page's keys (day-page.tsx) – off while something lies
 * over it. The tray's (`TrayProps`) go on to the page as they are – but for
 * its tile for a new stamp: here that is the shelf's (stamp-shelf.tsx).
 */
export const TodayView = ({
  calendar,
  locale,
  keyboard,
  ...tray
}: {
  calendar: string;
  locale: Locale;
  keyboard: boolean;
} & TrayProps) => {
  const today = useToday();
  const date = new Date(`${today}T12:00:00`);
  return (
    // A new day is a new page: what was in hand, picked or to be taken back
    // stays with the day before.
    <div className="animate-fade" key={today}>
      <DayPage
        {...tray}
        calendar={calendar}
        date={today}
        dayNote={<DayNote calendar={calendar} date={today} locale={locale} />}
        heading={
          // On a phone the date under the weekday – the switch between the
          // page and the note beside them (day-page.tsx).
          <h3 className="text-3xl leading-none">
            {date.toLocaleDateString(locale, { weekday: "long" })}{" "}
            <span className="font-bold text-muted @max-md:block">
              {date.toLocaleDateString(locale, {
                day: "numeric",
                month: "long",
              })}
            </span>
          </h3>
        }
        keyboard={keyboard}
        locale={locale}
        offerNew={false}
      />
    </div>
  );
};
