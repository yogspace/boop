import type { DayKey } from "@/features/calendar/model";

/** A day's key: 2026-10-12 (`month` 0–11). */
export const keyOf = (year: number, month: number, day: number): DayKey =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/**
 * Where a key in the year's table (year-grid.tsx) goes from a day – within
 * the year; at its ends it stays (null: a key that isn't the table's).
 *
 *   ↑ ↓         a day back or on – past a month's end into the next
 *   ← →         a month, on the same day where it has one (else its last)
 *   Home, End   the month's first and last
 */
export const stepOf = (from: DayKey, key: string): DayKey | null => {
  const year = Number(from.slice(0, 4));
  const month = Number(from.slice(5, 7)) - 1;
  const day = Number(from.slice(8, 10));
  const lengthOf = (m: number) => new Date(year, m + 1, 0).getDate();
  const byDays = (by: number) => {
    const to = new Date(year, month, day + by);
    return to.getFullYear() === year
      ? keyOf(year, to.getMonth(), to.getDate())
      : from;
  };
  const byMonths = (by: number) => {
    const to = month + by;
    return to < 0 || to > 11
      ? from
      : keyOf(year, to, Math.min(day, lengthOf(to)));
  };
  switch (key) {
    case "ArrowUp":
      return byDays(-1);
    case "ArrowDown":
      return byDays(1);
    case "ArrowLeft":
      return byMonths(-1);
    case "ArrowRight":
      return byMonths(1);
    case "Home":
      return keyOf(year, month, 1);
    case "End":
      return keyOf(year, month, lengthOf(month));
    default:
      return null;
  }
};
