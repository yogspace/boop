import { describe, expect, it } from "vitest";
import {
  cleanPalette,
  colorKeys,
  colorName,
  DEFAULT_PALETTE,
  FINISHES,
  finishOf,
  getPalette,
  hexOf,
  isColorKey,
  knownKey,
  nextKey,
  pickable,
  setPalette,
  wornFinish,
} from "../../src/features/calendar/palette";

describe("the stamp colors", () => {
  it("starts with the code's own", () => {
    expect(getPalette()).toBe(DEFAULT_PALETTE);
    expect(colorKeys()).toEqual([
      "red",
      "coral",
      "sun",
      "mint",
      "sky",
      "grape",
      "pink",
      "gold",
      "glitter",
      "holo",
      "wood",
      "confetti",
      "stars",
      "marble",
      "heat",
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

  it("keeps what makes a color special – only as it should be", () => {
    expect(
      cleanPalette([
        { key: "gold", hex: "#d4a72c", special: true, finish: "metal" },
        { key: "moss", hex: "#335533", special: false, finish: "matte" },
        { key: "fog", hex: "#cccccc", special: "yes", finish: "glitter" },
      ]).map(({ key, special, finish }) => ({ key, special, finish }))
    ).toEqual([
      { key: "gold", special: true, finish: "metal" },
      { key: "moss", special: undefined, finish: undefined },
      { key: "fog", special: undefined, finish: "glitter" },
    ]);
  });

  it("keeps every finish the CMS can give", () => {
    expect(
      cleanPalette(
        FINISHES.map((finish) => ({
          key: finish,
          hex: "#123456",
          special: true,
          finish,
        }))
      ).map((color) => color.finish)
    ).toEqual([...FINISHES]);
  });

  it("lets anyone pick the public colors – an admin all of them", () => {
    const keys = (colors: readonly { key: string }[]) =>
      colors.map((color) => color.key);
    expect(keys(pickable(DEFAULT_PALETTE))).toEqual([
      "red",
      "coral",
      "sun",
      "mint",
      "sky",
      "grape",
      "pink",
    ]);
    expect(keys(pickable(DEFAULT_PALETTE, { admin: false }))).not.toContain(
      "gold"
    );
    expect(keys(pickable(DEFAULT_PALETTE, { admin: true }))).toEqual(
      keys(DEFAULT_PALETTE)
    );
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

  it("starts things in a color it has", () => {
    expect(knownKey("grape")).toBe("grape");
    expect(knownKey("lime")).toBe("red");
    const colors = cleanPalette([
      { key: "moss", hex: "#335533" },
      { key: "grape", hex: "#7c5cff" },
    ]);
    expect(knownKey("grape", colors)).toBe("grape");
    expect(knownKey("red", colors)).toBe("moss");
    // No colors at all: the code's first.
    expect(knownKey("grape", [])).toBe("red");
  });

  it("gives new calendars a color in turns", () => {
    // The default – the first – sits out.
    expect(nextKey([])).toBe("coral");
    expect(nextKey(["coral"])).toBe("sun");
    expect(nextKey(["coral", "mint", "sun"])).toBe("sky");
    // A color that is gone from the palette takes no turn away.
    expect(nextKey(["gone", "coral"])).toBe("sun");
    // All taken: round and round, by how many there are.
    const all = ["coral", "sun", "mint", "sky", "grape", "pink"];
    expect(nextKey(all)).toBe("coral");
    expect(nextKey([...all, "coral"])).toBe("sun");
    // A palette of one has only that one to give.
    const one = cleanPalette([{ key: "moss", hex: "#335533" }]);
    expect(nextKey([], one)).toBe("moss");
    expect(nextKey(["moss", "moss"], one)).toBe("moss");
    expect(nextKey(["x"], [])).toBe("coral");
    // A special color takes no turn – not even as the only one left.
    const withGold = cleanPalette([
      { key: "moss", hex: "#335533" },
      { key: "gold", hex: "#d4a72c", special: true },
      { key: "mint", hex: "#22c993" },
    ]);
    expect(nextKey([], withGold)).toBe("mint");
    expect(nextKey(["mint"], withGold)).toBe("mint");
  });

  it("gives a finish to special colors only", () => {
    // The code's own: one special color in each finish, the public plain.
    for (const color of DEFAULT_PALETTE) {
      expect(finishOf(color.key)).toBe(
        color.special ? color.finish : undefined
      );
    }
    expect(DEFAULT_PALETTE.filter((color) => finishOf(color.key))).toHaveLength(
      FINISHES.length
    );
    setPalette([
      { key: "gold", hex: "#d4a72c", special: true, finish: "metal" },
      // Public, with a finish set in the CMS all the same: plain.
      { key: "shiny", hex: "#3fa9ff", finish: "glitter" },
      { key: "fog", hex: "#cccccc", special: false, finish: "holo" },
      // Special without a finish: plain too.
      { key: "plain", hex: "#335533", special: true },
    ]);
    expect(finishOf("gold")).toBe("metal");
    expect(finishOf("shiny")).toBeUndefined();
    expect(finishOf("fog")).toBeUndefined();
    expect(finishOf("plain")).toBeUndefined();
    // A literal hex – even a special color's – and a key that is gone.
    expect(finishOf("#d4a72c")).toBeUndefined();
    expect(finishOf("glitter")).toBeUndefined();
    setPalette(DEFAULT_PALETTE);
    expect(finishOf("glitter")).toBe("glitter");
  });

  it("tells a color's finish as it is – the CMS's row being edited", () => {
    expect(wornFinish({ special: true, finish: "wood" })).toBe("wood");
    expect(wornFinish({ special: false, finish: "wood" })).toBeUndefined();
    expect(wornFinish({ finish: "heat" })).toBeUndefined();
    expect(wornFinish({ special: true, finish: "shiny" })).toBeUndefined();
    expect(wornFinish({ special: true, finish: null })).toBeUndefined();
  });
});
