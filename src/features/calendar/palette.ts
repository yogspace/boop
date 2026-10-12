// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { LOCALES, type Locale } from "../../i18n/config";

/**
 * The stamp colors – the inks a stamp, a calendar or a print can have. They
 * come from the CMS (“Site” → Stamp colors, features/site/global.ts); the
 * ones here are what the code knows: the global's defaults, and what shows
 * while the global is empty or the database is out of reach.
 *
 * Client-safe: plain data and functions, no server code. Stamps, calendars
 * and prints store a color's KEY – never its hex – so a color can change in
 * the CMS and everything wearing it follows.
 *
 * The palette in use is one for everybody, kept here in the module: the
 * layout hands the CMS colors to `PaletteProvider` (palette-provider.tsx),
 * which sets them while rendering – on the server and in the browser alike.
 * Server components render before that: there, pass the colors along
 * (`getSite().stampColors`) instead of asking this module.
 */
export type StampColor = {
  /** What stamps, calendars and prints store, e.g. “mint”. */
  key: string;
  /** As #rrggbb, lower case. */
  hex: string;
  /** What pickers call it, per language. */
  name: Record<Locale, string>;
};

export const DEFAULT_PALETTE: StampColor[] = [
  { key: "ink", hex: "#1d1b3a", name: { de: "Tinte", en: "Ink" } },
  { key: "coral", hex: "#ff8159", name: { de: "Koralle", en: "Coral" } },
  { key: "sun", hex: "#ffc928", name: { de: "Sonne", en: "Sun" } },
  { key: "mint", hex: "#22c993", name: { de: "Minze", en: "Mint" } },
  { key: "sky", hex: "#3fa9ff", name: { de: "Himmel", en: "Sky" } },
  { key: "grape", hex: "#7c5cff", name: { de: "Traube", en: "Grape" } },
  { key: "pink", hex: "#ff5fae", name: { de: "Rosa", en: "Pink" } },
];

const KEY = /^[a-z][a-z0-9-]{0,23}$/;
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Whether a value could be a color's key – its form only, not whether the
 * palette has it: what is stored must outlive a color taken out of the CMS.
 */
export const isColorKey = (value: unknown): value is string =>
  typeof value === "string" && KEY.test(value);

/** A color as #rrggbb. */
export const isHex = (value: unknown): value is string =>
  typeof value === "string" && HEX.test(value);

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/**
 * A color's names: the given one per language (one string counts for all) –
 * a missing one is the code's for that key, else another language's, else
 * the key itself.
 */
const namesOf = (key: string, given: unknown): StampColor["name"] => {
  const names = (
    typeof given === "string"
      ? Object.fromEntries(LOCALES.map((locale) => [locale, given]))
      : (given ?? {})
  ) as Partial<Record<Locale, unknown>>;
  const own = DEFAULT_PALETTE.find((color) => color.key === key)?.name;
  const any = LOCALES.map((locale) => text(names[locale])).find(Boolean);
  return Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      text(names[locale]) || own?.[locale] || any || key,
    ])
  ) as StampColor["name"];
};

/**
 * Colors as they came from somewhere (the CMS, a page's props) – checked:
 * only those with a key and a hex, each key once (the first wins), names
 * filled in. Nothing usable gives an empty list.
 */
export const cleanPalette = (value: unknown): StampColor[] => {
  if (!Array.isArray(value)) return [];
  const colors = new Map<string, StampColor>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { key, hex, name } = entry as Record<string, unknown>;
    if (!(isColorKey(key) && isHex(hex)) || colors.has(key)) continue;
    colors.set(key, { key, hex: hex.toLowerCase(), name: namesOf(key, name) });
  }
  return [...colors.values()];
};

let palette: StampColor[] = DEFAULT_PALETTE;
let byKey = new Map(palette.map((color) => [color.key, color]));

/**
 * Sets the palette in use – while rendering (PaletteProvider), so calling it
 * again with the same colors changes nothing, not even the list itself.
 * Nothing usable in it: ignored, the palette stays as it is.
 */
export const setPalette = (colors: unknown) => {
  const next = cleanPalette(colors);
  if (!next.length || JSON.stringify(next) === JSON.stringify(palette)) return;
  palette = next;
  byKey = new Map(next.map((color) => [color.key, color]));
};

/** The colors to pick from, in the CMS's order. */
export const getPalette = (): readonly StampColor[] => palette;

/** Their keys, in the same order – the first is the default. */
export const colorKeys = (): string[] => palette.map((color) => color.key);

/**
 * The palette's color for a key – or the first one for a key it doesn't
 * have (anymore): a color deleted in the CMS leaves its stamps in that one.
 */
const colorOf = (key: string) => byKey.get(key) ?? palette[0];

/**
 * A color's hex – for a key, or for a literal "#rrggbb", which is itself
 * (so the admin's preview draws any color through the app's components).
 */
export const hexOf = (color: string): string =>
  isHex(color) ? color.toLowerCase() : colorOf(color).hex;

/**
 * A color's name in a language – for a literal hex the palette color with
 * that hex, or the hex as it is.
 */
export const colorName = (color: string, locale: Locale): string => {
  if (!isHex(color)) return colorOf(color).name[locale];
  const hex = color.toLowerCase();
  return palette.find((known) => known.hex === hex)?.name[locale] ?? hex;
};
