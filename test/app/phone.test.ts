import { describe, expect, it } from "vitest";
import { fadesOf } from "../../src/features/app/fading-edges";
import { mixOf, rgbOf } from "../../src/features/app/ground";
import { keyOf, stepOf } from "../../src/features/app/year-keys";

describe("fadesOf", () => {
  it("fades nowhere when all shows", () => {
    expect(fadesOf(0, 300, 300)).toEqual([0, 0]);
  });

  it("fades where more is hidden – as much as is, 32px at most", () => {
    expect(fadesOf(0, 561, 390)).toEqual([0, 32]);
    expect(fadesOf(10, 561, 390)).toEqual([10, 32]);
    expect(fadesOf(161, 561, 390)).toEqual([32, 10]);
    expect(fadesOf(171, 561, 390)).toEqual([32, 0]);
  });

  it("never fades by less than nothing – pulled past an end", () => {
    expect(fadesOf(-20, 561, 390)).toEqual([0, 32]);
    expect(fadesOf(200, 561, 390)).toEqual([32, 0]);
  });
});

describe("the ground's blend", () => {
  it("reads #rgb and #rrggbb – anything else is paper white", () => {
    expect(rgbOf("#ffc2da")).toEqual([255, 194, 218]);
    expect(rgbOf("#FFF")).toEqual([255, 255, 255]);
    expect(rgbOf("#0a0")).toEqual([0, 170, 0]);
    expect(rgbOf("var(--x)")).toEqual([255, 255, 255]);
  });

  it("mixes from one color to the other", () => {
    const from = rgbOf("#ffffff");
    const to = rgbOf("#8cedc3");
    expect(mixOf(from, to, 0)).toEqual([255, 255, 255]);
    expect(mixOf(from, to, 1)).toEqual([140, 237, 195]);
    expect(mixOf(from, to, 0.5)).toEqual([198, 246, 225]);
  });
});

describe("the year's keys", () => {
  it("writes a day's key", () => {
    expect(keyOf(2026, 9, 3)).toBe("2026-10-03");
  });

  it("goes day by day, on over a month's end", () => {
    expect(stepOf("2026-10-13", "ArrowDown")).toBe("2026-10-14");
    expect(stepOf("2026-01-31", "ArrowDown")).toBe("2026-02-01");
    expect(stepOf("2026-03-01", "ArrowUp")).toBe("2026-02-28");
  });

  it("goes month by month, on the same day where there is one", () => {
    expect(stepOf("2026-10-13", "ArrowRight")).toBe("2026-11-13");
    expect(stepOf("2026-01-31", "ArrowRight")).toBe("2026-02-28");
    expect(stepOf("2028-01-30", "ArrowRight")).toBe("2028-02-29");
    expect(stepOf("2026-03-31", "ArrowLeft")).toBe("2026-02-28");
  });

  it("goes to a month's first and last", () => {
    expect(stepOf("2026-02-14", "Home")).toBe("2026-02-01");
    expect(stepOf("2026-02-14", "End")).toBe("2026-02-28");
  });

  it("stays at the year's ends", () => {
    expect(stepOf("2026-01-01", "ArrowUp")).toBe("2026-01-01");
    expect(stepOf("2026-12-31", "ArrowDown")).toBe("2026-12-31");
    expect(stepOf("2026-01-15", "ArrowLeft")).toBe("2026-01-15");
    expect(stepOf("2026-12-15", "ArrowRight")).toBe("2026-12-15");
  });

  it("leaves other keys alone", () => {
    expect(stepOf("2026-10-13", "Enter")).toBeNull();
    expect(stepOf("2026-10-13", "Tab")).toBeNull();
  });
});
