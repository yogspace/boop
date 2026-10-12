"use client";

import type { Snapshot } from "valtio";
import { BADGE } from "@/components/ui";
import {
  type DayKey,
  type StampDoc,
  todayKey,
} from "@/features/calendar/model";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { DayNote } from "./day-note";
import { DayPage } from "./day-page";
import { Sheet } from "./sheet";

// Where the month (month-grid.tsx) has always found it.
export { seedOf } from "./day-page";

/**
 * A day of a calendar, opened from its month: the day's page with its
 * prints, inks and stamps (day-page.tsx), and the day's note under it.
 */
export const DaySheet = ({
  calendar,
  date,
  locale,
  stamps,
  onClose,
}: {
  calendar: string;
  date: DayKey;
  locale: Locale;
  stamps: readonly Snapshot<StampDoc>[];
  onClose: () => void;
}) => {
  const t = dictionaryOf(locale);
  const title = new Date(`${date}T12:00:00`).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <Sheet
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {title}
          {date === todayKey() && (
            <span className={cn(BADGE, "scribble-ink")}>{t.app.today}</span>
          )}
        </span>
      }
    >
      <DayPage
        calendar={calendar}
        date={date}
        locale={locale}
        stamps={stamps}
      />
      <DayNote calendar={calendar} date={date} locale={locale} />
    </Sheet>
  );
};
