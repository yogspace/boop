"use client";

import type { DayKey } from "@/features/calendar/model";
import type { Locale } from "@/i18n/config";

/**
 * A day's note – what happened that day, in a few words (bold, underlined,
 * line breaks). One per day of a calendar, written by its members together.
 * It stands under the day's page, wherever that shows (the day's sheet, the
 * today view).
 */
export const DayNote = (_props: {
  calendar: string;
  date: DayKey;
  locale: Locale;
}) => null;
