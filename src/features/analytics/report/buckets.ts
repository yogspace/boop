/**
 * The report's time in Berlin – its hours and days. The server runs in UTC,
 * the report's days and hours are Berlin's: otherwise “Monday” would start at
 * two in the night.
 */

export const TZ = "Europe/Berlin";
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

const partsFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: TZ,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  hourCycle: "h23",
});

/** A moment's calendar parts in Berlin – “Mo”, “09”, “10”, “2026”, “13”. */
export const berlin = (t: number) => {
  const parts = Object.fromEntries(
    partsFormat.formatToParts(new Date(t)).map((p) => [p.type, p.value])
  );
  return {
    weekday: (parts.weekday ?? "").replace(/\.$/, ""),
    day: parts.day ?? "",
    month: parts.month ?? "",
    year: parts.year ?? "",
    hour: parts.hour ?? "",
  };
};

/** “09.10. 13:44” – without toLocaleString's comma, which broke narrow cells. */
export const berlinStamp = (at: number) =>
  new Date(at)
    .toLocaleString("de-DE", {
      timeZone: TZ,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", "");

export type ReportBucket = {
  label: string;
  count: number;
  tick: boolean;
  /** Still running – the report ends “now”, in the middle of this one. */
  partial: boolean;
};

/**
 * Columns over the period – EVERY hour or day, even without views. Up to
 * three days in hours, beyond in days, as in the admin. Gone through hour by
 * hour, so the clock change (23- or 25-hour day) is no special case.
 */
export const reportBuckets = (
  times: number[],
  sinceMs: number,
  nowMs: number
): { grain: "hour" | "day"; buckets: ReportBucket[] } => {
  const grain = nowMs - sinceMs <= 3 * DAY_MS + HOUR_MS ? "hour" : "day";
  const keyOf = (t: number) => {
    if (grain === "hour") return String(t - (t % HOUR_MS));
    const b = berlin(t);
    return `${b.year}-${b.month}-${b.day}`;
  };
  const counts = new Map<string, number>();
  for (const t of times) {
    const key = keyOf(t);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const multiDay = nowMs - sinceMs > DAY_MS + HOUR_MS;
  const buckets: ReportBucket[] = [];
  const seen = new Set<string>();
  for (let t = sinceMs - (sinceMs % HOUR_MS); t < nowMs; t += HOUR_MS) {
    const key = keyOf(t);
    if (seen.has(key)) continue;
    seen.add(key);
    const b = berlin(t);
    const hour = Number(b.hour);
    buckets.push(
      grain === "hour"
        ? {
            label: multiDay && hour === 0 ? `${b.weekday} ${b.day}.` : b.hour,
            count: counts.get(key) ?? 0,
            tick: multiDay ? hour % 12 === 0 : hour % 3 === 0,
            partial: false,
          }
        : {
            label: `${b.day}.${b.month}.`,
            count: counts.get(key) ?? 0,
            tick: true,
            partial: false,
          }
    );
  }
  const last = buckets.at(-1);
  if (last) last.partial = true;
  if (grain === "day" && buckets.length > 16) {
    buckets.forEach((bucket, i) => {
      bucket.tick = i % 7 === 0 || i === buckets.length - 1;
    });
  }
  return { grain, buckets };
};
