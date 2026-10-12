import type { PayloadRequest } from "payload";
import { describe, expect, it } from "vitest";
import { DEFAULT_PALETTE } from "../../src/features/calendar/palette";
import {
  defaultColor,
  stampColorsOf,
} from "../../src/features/site/stamp-colors";

/** A request whose “Site” global holds these rows – or can't be read. */
const request = (stampColors: unknown, fails = false) =>
  ({
    payload: {
      findGlobal: async () => {
        if (fails) throw new Error("No database");
        return { stampColors };
      },
    },
  }) as unknown as PayloadRequest;

const ROWS = [
  { key: "moss", color: "#335533", name: { de: "Moos", en: "Moss" } },
  // One language only, as the global comes without `locale: "all"`.
  { key: "coral", color: "#FF8159", name: "Koralle" },
  { key: "Bad Key", color: "#111111", name: "x" },
  { key: "nohex", name: "x" },
];

describe("the stamp colors as the CMS keeps them", () => {
  it("reads the global's rows – only the proper ones", () => {
    expect(stampColorsOf(ROWS)).toEqual([
      { key: "moss", hex: "#335533", name: { de: "Moos", en: "Moss" } },
      { key: "coral", hex: "#ff8159", name: { de: "Koralle", en: "Koralle" } },
    ]);
  });

  it("falls back to the code's own with nothing usable", () => {
    expect(stampColorsOf(undefined)).toBe(DEFAULT_PALETTE);
    expect(stampColorsOf([])).toBe(DEFAULT_PALETTE);
    expect(stampColorsOf([{ key: "x" }])).toBe(DEFAULT_PALETTE);
  });

  it("starts a new document in the wished color, if the CMS has it", async () => {
    expect(await defaultColor(request(ROWS), "coral")).toBe("coral");
    // Gone from the CMS: its first color.
    expect(await defaultColor(request(ROWS), "ink")).toBe("moss");
    // A global never saved, or a database out of reach: the code's colors.
    expect(await defaultColor(request(undefined), "coral")).toBe("coral");
    expect(await defaultColor(request(ROWS, true), "coral")).toBe("coral");
    expect(await defaultColor(request(ROWS, true), "lime")).toBe("ink");
  });
});
