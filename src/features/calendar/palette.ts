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
  /**
   * Not public (the CMS's “Public” unticked): only accounts with the admin
   * box (accounts/collection.ts) can pick it – Max, for Boop's gifts
   * (features/cards). Everyone sees it on what wears it, like any other.
   */
  special?: boolean;
  /** How the rubber of a color looks in 3D – none: like any other. */
  finish?: Finish;
};

/** The rubber's looks besides the plain one (`StampColor.finish`). */
export const FINISHES = ["metal", "glitter"] as const;
export type Finish = (typeof FINISHES)[number];

const isFinish = (value: unknown): value is Finish =>
  typeof value === "string" && (FINISHES as readonly string[]).includes(value);

/**
 * The last two are not public – for Boop's gifts: the CMS starts with them,
 * and whatever it holds then is what counts.
 */
export const DEFAULT_PALETTE: StampColor[] = [
  { key: "red", hex: "#ee3b33", name: { de: "Rot", en: "Red" } },
  { key: "coral", hex: "#ff8159", name: { de: "Koralle", en: "Coral" } },
  { key: "sun", hex: "#ffc928", name: { de: "Sonne", en: "Sun" } },
  { key: "mint", hex: "#22c993", name: { de: "Minze", en: "Mint" } },
  { key: "sky", hex: "#3fa9ff", name: { de: "Himmel", en: "Sky" } },
  { key: "grape", hex: "#7c5cff", name: { de: "Traube", en: "Grape" } },
  { key: "pink", hex: "#ff5fae", name: { de: "Rosa", en: "Pink" } },
  {
    key: "gold",
    hex: "#d4a72c",
    name: { de: "Gold", en: "Gold" },
    special: true,
    finish: "metal",
  },
  {
    key: "glitter",
    hex: "#c264d6",
    name: { de: "Glitzer", en: "Glitter" },
    special: true,
    finish: "glitter",
  },
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
 * filled in; `special` and `finish` only as they should be. Nothing usable
 * gives an empty list.
 */
export const cleanPalette = (value: unknown): StampColor[] => {
  if (!Array.isArray(value)) return [];
  const colors = new Map<string, StampColor>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { key, hex, name, special, finish } = entry as Record<
      string,
      unknown
    >;
    if (!(isColorKey(key) && isHex(hex)) || colors.has(key)) continue;
    colors.set(key, {
      key,
      hex: hex.toLowerCase(),
      name: namesOf(key, name),
      ...(special === true && { special: true }),
      ...(isFinish(finish) && { finish }),
    });
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

/**
 * The colors, in the CMS's order – the special ones too: to pick from, see
 * `pickable`.
 */
export const getPalette = (): readonly StampColor[] => palette;

/**
 * The colors one may pick: the public ones – and, for an account with the
 * admin box, all of them.
 */
export const pickable = (
  colors: readonly StampColor[],
  { admin = false }: { admin?: boolean } = {}
) => (admin ? [...colors] : colors.filter((color) => !color.special));

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

/**
 * A key the colors have: the wished one – or, if they have no such color
 * (anymore), the first's. For what starts out in a color: a new stamp, the
 * ink pad, a calendar made without one. What is stored already keeps its
 * key. `colors`: the palette in use – on the server, the CMS's
 * (`getSite().stampColors`, or `defaultColor` in features/site).
 */
export const knownKey = (
  wished: string,
  colors: readonly StampColor[] = palette
): string =>
  colors.some((color) => color.key === wished)
    ? wished
    : (colors[0] ?? DEFAULT_PALETTE[0]).key;

/**
 * The color for one more of a kind – new calendars take turns: the first
 * that none of `taken` has yet, and round and round once all are taken. The
 * very first color sits out while there are others: it is the default, what
 * anything whose own color is gone shows in. The special ones take no turn.
 */
export const nextKey = (
  taken: readonly string[],
  colors: readonly StampColor[] = palette
): string => {
  const known = colors.length ? colors : DEFAULT_PALETTE;
  const open = pickable(known);
  const all = open.length ? open : known;
  const turns = all.length > 1 ? all.slice(1) : all;
  const free = turns.find((color) => !taken.includes(color.key));
  return (free ?? turns[taken.length % turns.length]).key;
};
