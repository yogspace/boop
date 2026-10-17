import type { SubscriptionRow } from "./devices";
import type { PushSettingsDoc } from "./settings";

/**
 * The reminder's time and the device's clock: when a reminder is due, in
 * the device's zone.
 */

/** The reminder's time when none is set – on the device's clock. */
export const DEFAULT_REMINDER_AT = "20:00";

/**
 * The latest reminder – the cron's last round of a day comes at 23:45 (it
 * runs every 15 minutes), anything later would never be due.
 */
export const LATEST_REMINDER_AT = "23:45";

/** A device's zone when it said none (or one this server doesn't know). */
export const DEFAULT_TIME_ZONE = "Europe/Berlin";

/** "20:00" → 1200 minutes – or null for anything else. */
export const minutesOf = (time: unknown): number | null => {
  if (typeof time !== "string") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/** A reminder's time as kept: "HH:MM", at most 23:45 – or null. */
export const cleanReminderAt = (value: unknown): string | null => {
  const minutes = minutesOf(value);
  if (minutes === null) return null;
  return minutes > (minutesOf(LATEST_REMINDER_AT) ?? 0)
    ? LATEST_REMINDER_AT
    : (value as string);
};

/** The account's reminder time – its own, or 20:00. */
export const reminderAtOf = (settings: PushSettingsDoc | null | undefined) =>
  cleanReminderAt(settings?.reminderAt) ?? DEFAULT_REMINDER_AT;

/** A zone the server's clock knows, like "Europe/Berlin". */
export const isTimeZone = (value: unknown): value is string => {
  if (typeof value !== "string" || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/** The day and the minute of the day it is now in a zone. */
export const localClock = (
  timeZone: string,
  now: Date
): { day: string; minutes: number } => {
  const zone = isTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
};

/**
 * The device's day when its reminder is due now – its time reached, none
 * sent that day yet – or null.
 */
export const reminderDue = (
  device: Pick<SubscriptionRow, "timeZone" | "remindedOn">,
  reminderAt: string,
  now: Date
): string | null => {
  const { day, minutes } = localClock(device.timeZone, now);
  if (device.remindedOn === day) return null;
  return minutes >= (minutesOf(reminderAt) ?? Number.POSITIVE_INFINITY)
    ? day
    : null;
};

/** Seconds left of the device's day – a reminder is no use the day after. */
export const secondsLeftOfDay = (timeZone: string, now: Date) =>
  Math.max(60, (24 * 60 - localClock(timeZone, now).minutes) * 60);
