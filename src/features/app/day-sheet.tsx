"use client";

import { BADGE } from "@/components/ui";
import { type DayKey, todayKey } from "@/features/calendar/model";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { DayNote } from "./day-note";
import { DayPage, type TrayProps } from "./day-page";
import { Sheet } from "./sheet";

// Where the month (month-grid.tsx) has always found it.
export { seedOf } from "./day-page";

/**
 * A day of a calendar, opened from its month: the day's page with its
 * prints, inks and stamps (day-page.tsx), and the day's note under the
 * page. The tray's (`TrayProps`) go on to the page as they are.
 */
export const DaySheet = ({
  calendar,
  date,
  locale,
  onClose,
  ...tray
}: {
  calendar: string;
  date: DayKey;
  locale: Locale;
  onClose: () => void;
} & TrayProps) => {
  const t = dictionaryOf(locale);
  const title = new Date(`${date}T12:00:00`).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    // Wider than a sheet's own on a large screen: the day's page wants the
    // room – the tools and the tray beside the page (day-page.tsx).
    <Sheet
      className="md:max-w-3xl lg:max-w-5xl"
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
        {...tray}
        calendar={calendar}
        date={date}
        dayNote={<DayNote calendar={calendar} date={date} locale={locale} />}
        inSheet
        locale={locale}
      />
    </Sheet>
  );
};
