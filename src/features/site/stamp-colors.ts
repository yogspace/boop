import type { PayloadRequest } from "payload";
// Relative, not `@/…`: the unit tests import this without the app's aliases.
import {
  cleanPalette,
  DEFAULT_PALETTE,
  knownKey,
  pickable,
  type StampColor,
} from "../calendar/palette";

/**
 * The stamp colors' rows as the “Site” global keeps them, checked
 * (palette.ts): a row without a proper key or hex is left out, a name
 * missing in a language filled in – and with no row left, the code's own
 * colors. “Public” unticked is a special color; a row from before the box
 * is public.
 */
export const stampColorsOf = (stored: unknown): StampColor[] => {
  const rows = (Array.isArray(stored) ? stored : []) as unknown[];
  const colors = cleanPalette(
    rows.map((row) => {
      const {
        key,
        color,
        name,
        public: open,
        finish,
      } = (row ?? {}) as Record<string, unknown>;
      return { key, hex: color, name, special: open === false, finish };
    })
  );
  return colors.length ? colors : DEFAULT_PALETTE;
};

/** The CMS's colors, read straight from the database – the code's without. */
export const stampColorsNow = async (req: PayloadRequest) => {
  const site = (await req.payload
    .findGlobal({ slug: "site", depth: 0, overrideAccess: true, req })
    .catch(() => null)) as { stampColors?: unknown } | null;
  return stampColorsOf(site?.stampColors);
};

/**
 * The key for what is made without a color of its own – a new account's
 * calendar, a change from a device that names none: the wished one if the
 * CMS has it, else its first color – a public one, either way. Read
 * straight from the database – hooks and endpoints run where the pages'
 * cache (get-site.ts) isn't – and only ever when a default is needed. Out
 * of reach: the code's own colors.
 */
export const defaultColor = async (req: PayloadRequest, wished: string) => {
  const colors = await stampColorsNow(req);
  const open = pickable(colors);
  return knownKey(wished, open.length ? open : colors);
};
