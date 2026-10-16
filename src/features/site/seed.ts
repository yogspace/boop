import type { Payload } from "payload";
import { LOCALES, type Locale } from "../../i18n/config";
// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { DEFAULT_SHAPES } from "../calendar/shapes";
import { DEFAULT_TEMPLATES } from "../calendar/templates";

export type SeedMode = "fill" | "replace";

/** A row of one of the global's lists – its names per language. */
type CodeRow = { key: string; name: Record<Locale, string> } & Record<
  string,
  unknown
>;

type StoredRow = { id?: string; key?: unknown; name?: unknown } & Record<
  string,
  unknown
>;

/**
 * One of the “Site” global's lists set to the code's – “fill” adds the rows
 * whose key it hasn't got, at the end, and leaves the others be; “replace”
 * makes it the code's list again. Each language's names in its own write:
 * the rows are the same, their names are per language.
 */
const seedList = async (
  payload: Payload,
  list: "stampShapes" | "drawingTemplates",
  code: CodeRow[],
  mode: SeedMode
) => {
  const read = async (locale: Locale) => {
    const site = (await payload.findGlobal({
      slug: "site",
      locale,
      fallbackLocale: false,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>;
    const rows = site[list];
    return (Array.isArray(rows) ? rows : []) as StoredRow[];
  };
  const [first, ...others] = LOCALES;
  const stored = mode === "replace" ? [] : await read(first);
  const known = new Set(stored.map((row) => row.key));
  const added = code.filter((row) => !known.has(row.key));
  if (mode === "fill" && !added.length) return `${stored.length} kept`;
  // What each language calls the rows kept – before anything is written.
  const names = new Map<Locale, Map<unknown, unknown>>();
  for (const locale of others) {
    const rows = mode === "replace" ? [] : await read(locale);
    names.set(locale, new Map(rows.map((row) => [row.id, row.name])));
  }
  const strip = ({ name: _, ...row }: CodeRow) => row;
  await payload.updateGlobal({
    slug: "site",
    locale: first,
    data: {
      [list]: [
        ...stored,
        ...added.map((row) => ({ ...strip(row), name: row.name[first] })),
      ],
    } as never,
    overrideAccess: true,
  });
  // The rows as written – with their ids – named in the other languages.
  const written = await read(first);
  for (const locale of others) {
    const before = names.get(locale) ?? new Map();
    await payload.updateGlobal({
      slug: "site",
      locale,
      data: {
        [list]: written.map((row) => {
          const own = code.find((one) => one.key === row.key);
          const fresh = !stored.some((kept) => kept.id === row.id);
          return {
            ...row,
            name: fresh && own ? own.name[locale] : (before.get(row.id) ?? ""),
          };
        }),
      } as never,
      overrideAccess: true,
    });
  }
  return mode === "replace"
    ? `set to the code's ${code.length}`
    : `${added.length} added (${added.map((row) => row.key).join(", ")}), ${stored.length} kept`;
};

/** The stamp shapes – the code's (shapes.ts) into Site → Stamp shapes. */
export const seedStampShapes = (payload: Payload, mode: SeedMode) =>
  seedList(
    payload,
    "stampShapes",
    DEFAULT_SHAPES.map(({ key, name, d }) => ({ key, name, d })),
    mode
  );

/** The drawing templates – the code's (templates.ts) into the global. */
export const seedDrawingTemplates = (payload: Payload, mode: SeedMode) =>
  seedList(
    payload,
    "drawingTemplates",
    DEFAULT_TEMPLATES.map(({ key, name, d, filled }) => ({
      key,
      name,
      d,
      filled,
    })),
    mode
  );
