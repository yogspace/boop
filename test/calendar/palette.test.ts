import { describe, expect, it } from "vitest";
import {
  cleanPalette,
  colorKeys,
  colorName,
  DEFAULT_PALETTE,
  getPalette,
  hexOf,
  isColorKey,
  setPalette,
} from "../../src/features/calendar/palette";

describe("the stamp colors", () => {
  it("starts with the code's own", () => {
    expect(getPalette()).toBe(DEFAULT_PALETTE);
    expect(colorKeys()).toEqual([
      "ink",
      "coral",
      "sun",
      "mint",
      "sky",
      "grape",
      "pink",
    ]);
    expect(hexOf("mint")).toBe("#22c993");
    expect(colorName("mint", "de")).toBe("Minze");
    expect(colorName("mint", "en")).toBe("Mint");
  });

  it("checks a key's form only", () => {
    expect(isColorKey("mint")).toBe(true);
    expect(isColorKey("gone-color-2")).toBe(true);
    expect(isColorKey("Mint")).toBe(false);
    expect(isColorKey("2nd")).toBe(false);
    expect(isColorKey("#22c993")).toBe(false);
    expect(isColorKey("a".repeat(25))).toBe(false);
    expect(isColorKey(null)).toBe(false);
  });

  it("takes a literal hex as it is", () => {
    expect(hexOf("#ABCDEF")).toBe("#abcdef");
    expect(colorName("#22C993", "en")).toBe("Mint");
    expect(colorName("#abcdef", "en")).toBe("#abcdef");
  });

  it("cleans what comes from the CMS", () => {
    expect(
      cleanPalette([
        { key: "mint", hex: "#00FF99", name: { de: "", en: "Fresh" } },
        { key: "mint", hex: "#111111", name: { de: "Doppelt" } },
        { key: "Bad Key", hex: "#111111", name: "x" },
        { key: "nohex", hex: "green", name: "x" },
        { key: "moss", hex: "#335533", name: { de: "Moos" } },
        { key: "bare", hex: "#000000" },
        null,
      ])
    ).toEqual([
      { key: "mint", hex: "#00ff99", name: { de: "Minze", en: "Fresh" } },
      { key: "moss", hex: "#335533", name: { de: "Moos", en: "Moos" } },
      { key: "bare", hex: "#000000", name: { de: "bare", en: "bare" } },
    ]);
    expect(cleanPalette("nothing")).toEqual([]);
  });

  it("ignores a palette with nothing usable", () => {
    setPalette([]);
    setPalette(undefined);
    setPalette([{ key: "x", hex: "nope" }]);
    expect(getPalette()).toBe(DEFAULT_PALETTE);
  });

  it("sets the CMS's colors – the same ones again change nothing", () => {
    const colors = [
      { key: "moss", hex: "#335533", name: { de: "Moos", en: "Moss" } },
      { key: "mint", hex: "#00ff99", name: { de: "Minze", en: "Mint" } },
    ];
    setPalette(colors);
    const set = getPalette();
    expect(colorKeys()).toEqual(["moss", "mint"]);
    expect(hexOf("mint")).toBe("#00ff99");
    setPalette(structuredClone(colors));
    expect(getPalette()).toBe(set);
    // A color that is gone shows in the first one.
    expect(hexOf("pink")).toBe("#335533");
    expect(colorName("pink", "en")).toBe("Moss");
    setPalette(DEFAULT_PALETTE);
    expect(hexOf("pink")).toBe("#ff5fae");
  });
});
