import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  HOUR_MS,
  reportBuckets,
} from "../../src/features/analytics/report/buckets";

describe("reportBuckets", () => {
  it("counts a day in hours, every hour present, the last one running", () => {
    // 2026-10-10 00:00 in Berlin (UTC+2).
    const since = Date.UTC(2026, 9, 9, 22);
    const now = since + DAY_MS;
    const { grain, buckets } = reportBuckets(
      [since + 30 * 60 * 1000, since + 40 * 60 * 1000, since + 5 * HOUR_MS],
      since,
      now
    );
    expect(grain).toBe("hour");
    expect(buckets).toHaveLength(24);
    expect(buckets[0]).toMatchObject({ label: "00", count: 2, tick: true });
    expect(buckets[5].count).toBe(1);
    expect(buckets.filter((b) => b.partial)).toHaveLength(1);
    expect(buckets.at(-1)?.partial).toBe(true);
  });

  it("counts a week in Berlin days", () => {
    const since = Date.UTC(2026, 9, 2, 22); // 2026-10-03 00:00 Berlin
    const now = since + 7 * DAY_MS;
    const { grain, buckets } = reportBuckets(
      [since + HOUR_MS, since + DAY_MS + HOUR_MS],
      since,
      now
    );
    expect(grain).toBe("day");
    expect(buckets.map((b) => b.label)).toEqual([
      "03.10.",
      "04.10.",
      "05.10.",
      "06.10.",
      "07.10.",
      "08.10.",
      "09.10.",
    ]);
    expect(buckets.map((b) => b.count)).toEqual([1, 1, 0, 0, 0, 0, 0]);
  });

  it("keeps one bucket per day across the clock change", () => {
    // Summer time ends on 2026-10-25 – that day has 25 hours.
    const since = Date.UTC(2026, 9, 22, 22); // 2026-10-23 00:00 Berlin
    const now = Date.UTC(2026, 9, 27, 23); // 2026-10-28 00:00 Berlin (UTC+1)
    const { buckets } = reportBuckets([], since, now);
    expect(buckets.map((b) => b.label)).toEqual([
      "23.10.",
      "24.10.",
      "25.10.",
      "26.10.",
      "27.10.",
    ]);
  });
});
