import type { MongooseAdapter } from "@payloadcms/db-mongodb";
import type { Payload } from "payload";
import { LOCALES, type Locale } from "../../i18n/config";
// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { cleanShapes, DEFAULT_SHAPES } from "../calendar/shapes";
import { cleanTemplates, DEFAULT_TEMPLATES } from "../calendar/templates";
import { ORDER_STEP, type ShapeCollection } from "./stamp-shapes";

export type SeedMode = "fill" | "replace";

/** A shape or template as the code has it – its names per language. */
type CodeRow = { key: string; name: Record<Locale, string> } & Record<
  string,
  unknown
>;

/**
 * Where the lists were before they had collections of their own: rows of
 * the “Site” global – still in its document, as the database keeps it.
 */
const LEGACY: Record<ShapeCollection, string> = {
  "stamp-shapes": "stampShapes",
  "drawing-templates": "drawingTemplates",
};

/**
 * The rows the “Site” global had for a list, checked like anything the CMS
 * keeps (shapes.ts, templates.ts). No field of the global any more, so read
 * raw (as translations/seed.ts does): a row's name per language, as stored.
 */
const legacyRows = async (
  payload: Payload,
  collection: ShapeCollection
): Promise<CodeRow[]> => {
  const { globals } = payload.db as unknown as MongooseAdapter;
  const site = (await globals.collection.findOne({
    globalType: "site",
  })) as Record<string, unknown> | null;
  const rows = site?.[LEGACY[collection]];
  return collection === "stamp-shapes"
    ? cleanShapes(rows)
    : cleanTemplates(rows);
};

/**
 * One document, written at its place – in the first language, then named in
 * each of the others.
 */
const write = async (
  payload: Payload,
  collection: ShapeCollection,
  { name, ...row }: CodeRow,
  order: number
) => {
  const [first, ...others] = LOCALES;
  const doc = await payload.create({
    collection,
    locale: first,
    data: { ...row, name: name[first], order } as never,
    depth: 0,
    overrideAccess: true,
  });
  for (const locale of others) {
    await payload.update({
      collection,
      id: doc.id,
      locale,
      data: { name: name[locale] } as never,
      depth: 0,
      overrideAccess: true,
    });
  }
};

/**
 * One of the collections set to the code's list – “fill” adds what it
 * hasn't got (by key) after the last, and leaves the rest be; “replace”
 * makes it the code's list again.
 *
 * Fill on an empty collection whose list the “Site” global still has (from
 * before the collections) takes that list over instead, as it was – the
 * code's are added by the next fill.
 */
const seedCollection = async (
  payload: Payload,
  collection: ShapeCollection,
  code: CodeRow[],
  mode: SeedMode
) => {
  if (mode === "replace") {
    await payload.delete({
      collection,
      where: { id: { exists: true } },
      overrideAccess: true,
    });
  }
  const { docs } = await payload.find({
    collection,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const kept = docs as unknown as { key?: unknown; order?: unknown }[];
  if (mode === "fill" && !kept.length) {
    const before = await legacyRows(payload, collection);
    if (before.length) {
      for (const [i, row] of before.entries()) {
        await write(payload, collection, row, (i + 1) * ORDER_STEP);
      }
      return `${before.length} taken over from Site (${before.map((row) => row.key).join(", ")})`;
    }
  }
  const known = new Set(kept.map((doc) => doc.key));
  const added = code.filter((row) => !known.has(row.key));
  if (mode === "fill" && !added.length) return `${kept.length} kept`;
  let place = Math.max(
    0,
    ...kept.map((doc) => (typeof doc.order === "number" ? doc.order : 0))
  );
  for (const row of added) {
    place += ORDER_STEP;
    await write(payload, collection, row, place);
  }
  return mode === "replace"
    ? `set to the code's ${code.length}`
    : `${added.length} added (${added.map((row) => row.key).join(", ")}), ${kept.length} kept`;
};

/** The stamp shapes – the code's (shapes.ts) into Content → Stamp shapes. */
export const seedStampShapes = (payload: Payload, mode: SeedMode) =>
  seedCollection(
    payload,
    "stamp-shapes",
    DEFAULT_SHAPES.map(({ key, name, d }) => ({ key, name, d })),
    mode
  );

/** The drawing templates – the code's (templates.ts) into theirs. */
export const seedDrawingTemplates = (payload: Payload, mode: SeedMode) =>
  seedCollection(
    payload,
    "drawing-templates",
    DEFAULT_TEMPLATES.map(({ key, name, d, filled }) => ({
      key,
      name,
      d,
      filled,
    })),
    mode
  );
