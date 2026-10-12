import { describe, expect, it } from "vitest";
import { DEFAULT_PALETTE } from "../../src/features/calendar/palette";
import {
  contrast,
  GROUND,
  PAPER,
  PENCIL,
  shownColor,
  tintOf,
  tintVars,
} from "../../src/features/calendar/tint";

/** Marker and pencil, as styles.css has them. */
const INK = "#141414";
const MUTED = "#6b6b6b";
const WHITE = "#ffffff";

const PALETTE = DEFAULT_PALETTE.map((color) => color.hex);

/** A color by hue (0–360), saturation and value (0–1), as #rrggbb. */
const hsv = (h: number, s: number, v: number) => {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[channel(5), channel(3), channel(1)]
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
};

/**
 * What a calendar may be colored: the palette, and whatever a CMS may hold –
 * no color at all, very dark ones, and once round the wheel: loud, dark,
 * light and dull.
 */
const COLORS = [
  ...PALETTE,
  "#000000",
  "#ffffff",
  "#808080",
  "#0b1a5c",
  "#335533",
  ...Array.from({ length: 36 }, (_, i) => i * 10).flatMap((h) => [
    hsv(h, 1, 1),
    hsv(h, 1, 0.5),
    hsv(h, 0.5, 1),
    hsv(h, 0.6, 0.3),
    hsv(h, 0.25, 0.9),
  ]),
];

const channels = (hex: string) =>
  [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

/** How colorful, roughly: the widest gap between two channels (0–255). */
const colorful = (hex: string) =>
  Math.max(...channels(hex)) - Math.min(...channels(hex));

/** A print on a surface: multiplied, as `mix-blend-multiply` lays it on. */
const printed = (ink: string, surface: string) => {
  const under = channels(surface);
  return `#${channels(ink)
    .map((c, i) =>
      Math.round((c * under[i]) / 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
};

describe("a calendar's shades", () => {
  it("measures contrast as WCAG does", () => {
    expect(contrast("#000000", WHITE)).toBeCloseTo(21, 5);
    expect(contrast(WHITE, "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#777777")).toBe(1);
    // Pencil on paper, as styles.css says.
    expect(contrast(MUTED, WHITE)).toBeGreaterThan(5.3);
  });

  it("keeps every shade a color: #rrggbb", () => {
    for (const hex of COLORS) {
      for (const shade of Object.values(tintOf(hex))) {
        expect(shade).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("keeps the color itself, lower case", () => {
    expect(tintOf("#FFC928").color).toBe("#ffc928");
    expect(tintOf("#FFC928")).toBe(tintOf("#ffc928"));
  });

  it("lets ink read on every shade – whatever the color", () => {
    for (const hex of COLORS) {
      const { bg, soft, wash, mark } = tintOf(hex);
      expect(contrast(INK, soft)).toBeGreaterThan(15);
      expect(contrast(INK, wash)).toBeGreaterThan(13);
      expect(contrast(INK, bg)).toBeGreaterThan(11);
      expect(contrast(INK, mark)).toBeGreaterThan(10);
    }
  });

  it("sets a pencil that reads on the ground, the paper and the weekend", () => {
    expect(PAPER["--color-muted"]).toBe(PENCIL);
    expect(GROUND["--color-muted"]).toBe(PENCIL);
    for (const hex of COLORS) {
      const { bg, soft, wash } = tintOf(hex);
      expect(contrast(PENCIL, bg)).toBeGreaterThan(4.5);
      expect(contrast(PENCIL, soft)).toBeGreaterThan(4.5);
      expect(contrast(PENCIL, wash)).toBeGreaterThan(4.5);
    }
    // The usual pencil would not do on the ground – hence the darker one.
    expect(contrast(MUTED, tintOf("#ffc928").bg)).toBeLessThan(4.5);
  });

  it("tells the layers apart: paper on its ground, the weekend on the paper", () => {
    for (const hex of COLORS) {
      const { bg, soft, wash, mark } = tintOf(hex);
      expect(contrast(soft, WHITE)).toBeGreaterThan(1.1);
      expect(contrast(soft, bg)).toBeGreaterThan(1.2);
      expect(contrast(wash, soft)).toBeGreaterThan(1.1);
      // The highlighter shows on white and on the paper.
      expect(contrast(mark, WHITE)).toBeGreaterThan(1.3);
      expect(contrast(mark, soft)).toBeGreaterThan(1.3);
    }
  });

  it("shows which color it is – on the paper alone, more so on each next", () => {
    for (const hex of PALETTE) {
      const { bg, soft, wash, mark } = tintOf(hex);
      expect(colorful(soft)).toBeGreaterThan(16);
      expect(colorful(wash)).toBeGreaterThan(colorful(soft));
      expect(colorful(bg)).toBeGreaterThan(colorful(wash));
      expect(colorful(mark)).toBeGreaterThan(colorful(bg));
    }
  });

  it("keeps a print in the paper's own color clear on it – yellow on yellow", () => {
    for (const hex of PALETTE) {
      const { soft, wash } = tintOf(hex);
      const onWhite = contrast(hex, WHITE);
      for (const surface of [soft, wash]) {
        const there = contrast(printed(hex, surface), surface);
        expect(there).toBeGreaterThan(1.4);
        expect(there).toBeGreaterThan(onWhite * 0.75);
      }
    }
  });

  it("makes an ink of the color that reads on white and on its paper", () => {
    for (const hex of COLORS) {
      const { ink, soft } = tintOf(hex);
      expect(contrast(ink, WHITE)).toBeGreaterThan(7);
      expect(contrast(ink, soft)).toBeGreaterThan(7);
    }
  });

  it("keeps a color's hue: yellow paper is warm, blue paper cool", () => {
    const [sunRed, , sunBlue] = channels(tintOf("#ffc928").soft);
    const [skyRed, , skyBlue] = channels(tintOf("#3fa9ff").soft);
    expect(sunRed).toBeGreaterThan(sunBlue);
    expect(skyBlue).toBeGreaterThan(skyRed);
    // No color at all stays grey.
    const [r, g, b] = channels(tintOf("#808080").soft);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it("hands them out as CSS variables", () => {
    const tint = tintOf("#22c993");
    expect(tintVars("#22c993")).toEqual({
      "--cal": "#22c993",
      "--cal-bg": tint.bg,
      "--cal-soft": tint.soft,
      "--cal-wash": tint.wash,
      "--cal-line": tint.line,
      "--cal-mark": tint.mark,
      "--cal-ink": tint.ink,
    });
  });
});

describe("the color someone sees a calendar in", () => {
  const calendar = { color: "mint" };

  it("is their own for it, once they picked one", () => {
    expect(shownColor(calendar, "grape")).toBe("grape");
    // The same as the calendar's is a pick too: it stays when that changes.
    expect(shownColor({ color: "sun" }, "mint")).toBe("mint");
  });

  it("is the calendar's while they picked none", () => {
    expect(shownColor(calendar)).toBe("mint");
    expect(shownColor(calendar, undefined)).toBe("mint");
    expect(shownColor(calendar, null)).toBe("mint");
    expect(shownColor(calendar, "")).toBe("mint");
  });
});
