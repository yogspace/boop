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

  it("takes “Public” unticked as a special color – and a finish as it is", () => {
    expect(
      stampColorsOf([
        { key: "moss", color: "#335533", name: "Moos", public: true },
        // From before the box: public.
        { key: "coral", color: "#ff8159", name: "Koralle" },
        {
          key: "gold",
          color: "#d4a72c",
          name: "Gold",
          public: false,
          finish: "metal",
        },
        { key: "fog", color: "#cccccc", name: "Nebel", finish: null },
      ]).map(({ key, special, finish }) => ({ key, special, finish }))
    ).toEqual([
      { key: "moss", special: undefined, finish: undefined },
      { key: "coral", special: undefined, finish: undefined },
      { key: "gold", special: true, finish: "metal" },
      { key: "fog", special: undefined, finish: undefined },
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
    expect(await defaultColor(request(ROWS), "red")).toBe("moss");
    // A global never saved, or a database out of reach: the code's colors.
    expect(await defaultColor(request(undefined), "coral")).toBe("coral");
    expect(await defaultColor(request(ROWS, true), "coral")).toBe("coral");
    expect(await defaultColor(request(ROWS, true), "lime")).toBe("red");
  });

  it("never starts one in a special color – wished or first", async () => {
    const rows = [
      { key: "gold", color: "#d4a72c", name: "Gold", public: false },
      { key: "moss", color: "#335533", name: "Moos" },
    ];
    expect(await defaultColor(request(rows), "gold")).toBe("moss");
    expect(await defaultColor(request(rows), "red")).toBe("moss");
    // The code's own special ones neither.
    expect(await defaultColor(request(undefined), "gold")).toBe("red");
  });
});
