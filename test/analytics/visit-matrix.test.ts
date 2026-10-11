import { describe, expect, it } from "vitest";
import {
  buildVisitMatrix,
  deviceName,
  OTHER,
  type Visit,
  visitShade,
} from "../../src/features/analytics/visit-matrix";

const visit = (page: string, device: string, at: number): Visit => ({
  page,
  device,
  at,
});

const VISITS: Visit[] = [
  visit("/de", "mobile · iOS 18 · Safari 18", 1),
  visit("/de", "mobile · iOS 18 · Safari 18", 5),
  visit("/de", "desktop · macOS · Safari 18", 3),
  visit("/en/app", "desktop · macOS · Safari 18", 7),
  visit("/en/app", "tablet · Android 14 · Chrome 141", 2),
  visit("/de/login", "desktop · Windows · Edge 141", 4),
];

describe("deviceName", () => {
  it("joins class, system and browser", () => {
    expect(
      deviceName({ device: "mobile", os: "iOS 18", browser: "Safari 18" })
    ).toBe("mobile · iOS 18 · Safari 18");
    expect(deviceName({ device: "desktop", os: null })).toBe("desktop");
    expect(deviceName({})).toBe("—");
  });
});

describe("buildVisitMatrix", () => {
  it("ranks rows and columns by total and keeps the last view", () => {
    const m = buildVisitMatrix(VISITS, { rowAxis: "page" });
    expect(m.rows.map(([row]) => row)).toEqual(["/de", "/en/app", "/de/login"]);
    expect(m.rows[0][1]).toEqual({ count: 3, lastAt: 5 });
    // A tie (2 and 2) keeps the order of first appearance.
    expect(m.columns.slice(0, 2)).toEqual([
      "mobile · iOS 18 · Safari 18",
      "desktop · macOS · Safari 18",
    ]);
    expect(m.cell("/de", "mobile · iOS 18 · Safari 18")).toEqual({
      count: 2,
      lastAt: 5,
    });
    expect(m.max).toBe(2);
    expect(m.activeCol).toBeNull();
  });

  it("folds the weaker columns into Other", () => {
    const m = buildVisitMatrix(VISITS, { rowAxis: "page", maxColumns: 2 });
    expect(m.columns).toHaveLength(3);
    expect(m.columns.at(-1)).toBe(OTHER);
    expect(m.columnTotal(OTHER)?.count).toBe(2);
    // Every view lands in exactly one cell.
    const sum = m.rows.reduce(
      (total, [row]) =>
        total +
        m.columns.reduce((n, col) => n + (m.cell(row, col)?.count ?? 0), 0),
      0
    );
    expect(sum).toBe(VISITS.length);
  });

  it("with a chosen column, keeps only its rows, ordered by it", () => {
    const m = buildVisitMatrix(VISITS, {
      rowAxis: "device",
      sortCol: "/en/app",
    });
    expect(m.activeCol).toBe("/en/app");
    expect(m.rows.map(([row]) => row)).toEqual([
      "desktop · macOS · Safari 18",
      "tablet · Android 14 · Chrome 141",
    ]);
  });

  it("ignores a chosen column that does not exist", () => {
    const m = buildVisitMatrix(VISITS, { rowAxis: "page", sortCol: "nope" });
    expect(m.activeCol).toBeNull();
    expect(m.rows).toHaveLength(3);
  });
});

describe("visitShade", () => {
  it("is 0 for nothing and grows by the square root", () => {
    expect(visitShade(0, 40)).toBe(0);
    expect(visitShade(40, 40)).toBe(1);
    expect(visitShade(10, 40)).toBeCloseTo(0.5);
  });
});
