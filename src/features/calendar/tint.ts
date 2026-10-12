/**
 * A calendar's color as the shades its view wears – the paper it lies on,
 * the highlighter that marks things on it. The principle of ccm's greeting
 * cards (glaze.css there): every shade has a lightness of its own and takes
 * the color's hue and a part of its strength. So whatever the color is – a
 * yellow, a navy, one changed in the CMS – one sees at a glance which it is,
 * on the paper alone too, and what is written on a shade still reads.
 *
 * Worked out here rather than in CSS (`oklch(from …)`): no browser has to
 * know relative colors for it, and the contrasts are tested
 * (test/calendar/tint.test.ts). Client-safe, no imports.
 *
 * In use as CSS variables (`tintVars`), set where a calendar shows – on the
 * app's frame (features/app/boop-app.tsx), so the calendar's page and every
 * sheet opened from it can read them:
 *
 *   --cal        the color itself – a dot, never under or as text
 *   --cal-bg     the ground the app lies on: clearly the color, yet calm
 *   --cal-soft   its paper, lying on that ground: the calendar's page
 *   --cal-wash   the second tone on that paper: the weekend, a soft fill
 *   --cal-line   a pencil line in the color: hatching
 *   --cal-mark   a highlighter, the strongest of them – under ink: the
 *                name, today
 *   --cal-ink    the color dark enough to write with, on white and the paper
 *
 * Ink reads on all of them (10:1 and more). Pencil – `--color-muted` – is
 * too faint on the stronger ones: where they show it is a shade darker
 * (`PENCIL`, set by `PAPER` and `GROUND`), which keeps 4.5:1 on each.
 */

/**
 * A shade: how light (OKLCH, 0–1), how much of the color's chroma – and how
 * much chroma at most. Pale, a screen shows far more yellow and green than
 * red or violet (those run out of room, the lighter the sooner): without
 * that lid a yellow calendar's paper would come out far more colorful than a
 * red one's. And the lighter a shade, the less color it can hold at all –
 * so none of them is lighter than its color needs.
 */
type Shade = { l: number; part: number; most?: number };

const SHADES = {
  bg: { l: 0.875, part: 0.75, most: 0.11 },
  soft: { l: 0.95, part: 0.3, most: 0.04 },
  wash: { l: 0.905, part: 0.5, most: 0.07 },
  line: { l: 0.8, part: 0.6 },
  mark: { l: 0.84, part: 0.9, most: 0.15 },
  ink: { l: 0.4, part: 0.9 },
} as const satisfies Record<string, Shade>;

export type Tint = Record<keyof typeof SHADES, string> & {
  /** The color itself, as #rrggbb. */
  color: string;
};

type Triple = [number, number, number];

const toLinear = (c: number) =>
  c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

const toGamma = (c: number) =>
  c <= 0.003_130_8 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;

/** #rrggbb as linear light, 0–1 each. */
const linearOf = (hex: string): Triple => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [
    toLinear(((n >> 16) & 255) / 255),
    toLinear(((n >> 8) & 255) / 255),
    toLinear((n & 255) / 255),
  ];
};

/** Linear light as OKLab (Björn Ottosson's): lightness, and a/b for the hue. */
const labOf = ([r, g, b]: Triple): Triple => {
  const l = Math.cbrt(
    0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b
  );
  const m = Math.cbrt(
    0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b
  );
  const s = Math.cbrt(
    0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b
  );
  return [
    0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s,
    1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s,
    0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s,
  ];
};

const linearOfLab = ([L, a, b]: Triple): Triple => {
  const l = (L + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const m = (L - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const s = (L - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;
  return [
    4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s,
    -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s,
    -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s,
  ];
};

const shows = (rgb: Triple) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

const hexOfLinear = (rgb: Triple) =>
  `#${rgb
    .map((c) =>
      Math.round(toGamma(Math.min(Math.max(c, 0), 1)) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;

/**
 * The color at a shade's lightness. A screen can't show every strength at
 * every lightness (no strong yellow is dark, no strong blue pale): then the
 * strength gives way, as far as needed – the lightness and the hue stay.
 */
const shade = ([, a, b]: Triple, { l, part, most }: Shade) => {
  const chroma = Math.hypot(a, b);
  let low = 0;
  let high = most && chroma ? Math.min(part, most / chroma) : part;
  let rgb = linearOfLab([l, a * high, b * high]);
  if (!shows(rgb)) {
    for (let i = 0; i < 16; i++) {
      const mid = (low + high) / 2;
      if (shows(linearOfLab([l, a * mid, b * mid]))) low = mid;
      else high = mid;
    }
    rgb = linearOfLab([l, a * low, b * low]);
  }
  return hexOfLinear(rgb);
};

const known = new Map<string, Tint>();

/** A color's shades – `hex` as #rrggbb (`hexOf` in palette.ts). */
export const tintOf = (hex: string): Tint => {
  const color = hex.toLowerCase();
  let tint = known.get(color);
  if (!tint) {
    const lab = labOf(linearOf(color));
    tint = {
      color,
      bg: shade(lab, SHADES.bg),
      soft: shade(lab, SHADES.soft),
      wash: shade(lab, SHADES.wash),
      line: shade(lab, SHADES.line),
      mark: shade(lab, SHADES.mark),
      ink: shade(lab, SHADES.ink),
    };
    known.set(color, tint);
  }
  return tint;
};

/**
 * The shades as CSS variables, for a `style` – everything below reads them
 * (`bg-[var(--cal-soft)]`, `[--scribble-fill:var(--cal-mark)]`).
 */
export const tintVars = (hex: string): Record<`--cal${string}`, string> => {
  const tint = tintOf(hex);
  return {
    "--cal": tint.color,
    "--cal-bg": tint.bg,
    "--cal-soft": tint.soft,
    "--cal-wash": tint.wash,
    "--cal-line": tint.line,
    "--cal-mark": tint.mark,
    "--cal-ink": tint.ink,
  };
};

/**
 * The pencil on a calendar's shades: darker than the usual one (#6b6b6b,
 * styles.css), which is too faint on a colored surface. This one keeps
 * 4.5:1 on the ground, the paper and the weekend's wash, whatever the color
 * (see the test).
 */
export const PENCIL = "#4f4f4f";

/**
 * A calendar's own paper – for whatever shows one of its pages (the month,
 * a day): what is paper white elsewhere – a frame's fill – and the paper grey
 * with its pencil – a soft fill, the weekend's wash and hatching – take the
 * calendar's shades there. So whatever is drawn on the page follows, without
 * knowing of a calendar's color. The marker stays black. Set as `style`,
 * inside the frame that has `tintVars`.
 */
export const PAPER = {
  "--color-card": "var(--cal-soft)",
  "--color-soft": "var(--cal-wash)",
  "--color-line": "var(--cal-line)",
  "--color-muted": PENCIL,
} as const;

/**
 * For what stands on the app's ground (`--cal-bg`) around a calendar's page
 * – the header, the pills, the shelf, the footer. Frames stay paper white
 * there and the marker black; the pencil is the darker one, and a soft fill
 * is the calendar's paper instead of paper grey. Set as `style` on the
 * frame, not around the sheets: those stay as they are.
 */
export const GROUND = {
  "--color-muted": PENCIL,
  "--color-soft": "var(--cal-soft)",
} as const;

/**
 * The color someone sees a calendar in – a color's key. A calendar's color
 * is everyone's own: whoever picked one for it sees that one (`own` – their
 * entry in the own settings, offline/store.ts); whoever didn't sees the
 * calendar's – its owner's pick, the tone it starts out in for all.
 */
export const shownColor = (
  calendar: { color: string },
  own?: string | null
): string => own || calendar.color;

/**
 * How well two colors tell apart, as WCAG counts it: 1 (not at all) to 21
 * (black on white). Text wants 4.5.
 */
export const contrast = (one: string, other: string) => {
  const light = (hex: string) => {
    const [r, g, b] = linearOf(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [dark, bright] = [light(one), light(other)].sort((x, y) => x - y);
  return (bright + 0.05) / (dark + 0.05);
};
