// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { LOCALES, type Locale } from "../../i18n/config";
import { readPath, ringOf } from "./path";

/**
 * The stamp shapes – the bodies a stamp can have. Like the stamp colors
 * (palette.ts) they come from the CMS (“Site” → Stamp shapes,
 * features/site/global.ts); the ones here are what the code knows: the
 * global's defaults, and what shows while it is empty or the database is
 * out of reach.
 *
 * A shape is an outline – an SVG path in a 100 × 100 box (y down), fit into
 * the stamp as large as it goes, centered. Everything else is worked out
 * from it (outline.ts): the outline drawn and printed, the rim along it, the
 * rubber and block in 3D, the STL, the editor's guides. Stamps store a
 * shape's KEY, so a shape can change in the CMS and every stamp in it
 * follows; a key the CMS doesn't have (any more) shows as its first shape.
 *
 * Client-safe: plain data and functions. The shapes in use are one list for
 * everybody, kept here like the palette: the layout hands the CMS's to
 * `ShapesProvider` (shapes-provider.tsx), which sets them while rendering.
 */
export type StampShapeDef = {
  /** What stamps store, e.g. “heart”. */
  key: string;
  /** What pickers call it, per language. */
  name: Record<Locale, string>;
  /** Its outline: an SVG path, in a 100 × 100 box. */
  d: string;
};

/**
 * A shape to draw: its key – or, for something not saved yet (the CMS's
 * preview), its outline itself.
 */
export type ShapeLike = string | { d: string };

/**
 * The code's shapes – the round ones, then those with corners. The first
 * five of today's (circle, square, octagon, triangle, diamond) are the very
 * outlines stamps had before shapes came from the CMS.
 */
export const DEFAULT_SHAPES: StampShapeDef[] = [
  {
    key: "circle",
    name: { de: "Rund", en: "Round" },
    d: "M98 50A48 48 0 0 1 2 50A48 48 0 0 1 98 50Z",
  },
  {
    key: "oval",
    name: { de: "Oval", en: "Oval" },
    d: "M98 50A48 33.6 0 0 1 2 50A48 33.6 0 0 1 98 50Z",
  },
  {
    key: "flower",
    name: { de: "Blume", en: "Flower" },
    d: "M29.61 16.99A21 21 0 0 1 70.39 16.99A4.5 4.5 0 0 0 75.09 20.4A21 21 0 0 1 87.7 59.19A4.5 4.5 0 0 0 85.9 64.72A21 21 0 0 1 52.9 88.69A4.5 4.5 0 0 0 47.1 88.69A21 21 0 0 1 14.1 64.72A4.5 4.5 0 0 0 12.3 59.19A21 21 0 0 1 24.91 20.4A4.5 4.5 0 0 0 29.61 16.99Z",
  },
  {
    key: "heart",
    name: { de: "Herz", en: "Heart" },
    d: "M50 20.26C57.65 9.52 66.49 7.16 73.32 7.16C86.6 7.16 100 18.44 100 35.03C100 61.77 69.49 83.97 54.07 91.17C50.08 93.03 49.92 93.03 45.93 91.17C30.51 83.97 0 61.77 0 35.03C0 18.44 13.4 7.16 26.68 7.16C33.51 7.16 42.35 9.52 50 20.26Z",
  },
  {
    key: "cloud",
    name: { de: "Wolke", en: "Cloud" },
    d: "M91.41 52.21A13 13 0 0 1 81 73L19 73A14 14 0 0 1 13.56 46.1A4 4 0 0 0 16.01 42.53A17 17 0 0 1 31.69 26.05A5 5 0 0 0 35.69 23.46A22 22 0 0 1 76.16 27.99A5 5 0 0 0 79.73 31.47A15 15 0 0 1 90.69 49.01A4 4 0 0 0 91.41 52.21Z",
  },
  {
    key: "star",
    name: { de: "Stern", en: "Star" },
    d: "M47.02 7.7A3.2 3.2 0 0 1 52.98 7.7L62.26 31.64A1.6 1.6 0 0 0 63.67 32.66L89.31 34.09A3.2 3.2 0 0 1 91.15 39.77L71.25 55.99A1.6 1.6 0 0 0 70.71 57.64L77.28 82.47A3.2 3.2 0 0 1 72.45 85.98L50.87 72.06A1.6 1.6 0 0 0 49.13 72.06L27.55 85.98A3.2 3.2 0 0 1 22.72 82.47L29.29 57.64A1.6 1.6 0 0 0 28.75 55.99L8.85 39.77A3.2 3.2 0 0 1 10.69 34.09L36.33 32.66A1.6 1.6 0 0 0 37.74 31.64Z",
  },
  {
    key: "square",
    name: { de: "Eckig", en: "Square" },
    d: "M2 15A13 13 0 0 1 15 2L85 2A13 13 0 0 1 98 15L98 85A13 13 0 0 1 85 98L15 98A13 13 0 0 1 2 85Z",
  },
  {
    key: "ticket",
    name: { de: "Ticket", en: "Ticket" },
    d: "M14.25 20L85.75 20A2.5 2.5 0 0 1 88.2 22A10 10 0 0 0 96 29.8A2.5 2.5 0 0 1 98 32.25L98 67.75A2.5 2.5 0 0 1 96 70.2A10 10 0 0 0 88.2 78A2.5 2.5 0 0 1 85.75 80L14.25 80A2.5 2.5 0 0 1 11.8 78A10 10 0 0 0 4 70.2A2.5 2.5 0 0 1 2 67.75L2 32.25A2.5 2.5 0 0 1 4 29.8A10 10 0 0 0 11.8 22A2.5 2.5 0 0 1 14.25 20Z",
  },
  {
    key: "postage",
    name: { de: "Briefmarke", en: "Postage stamp" },
    d: "M15.28 2L16.47 2A1 1 0 0 1 17.44 2.77A3.4 3.4 0 0 0 24.06 2.77A1 1 0 0 1 25.03 2L26.22 2A1 1 0 0 1 27.19 2.77A3.4 3.4 0 0 0 33.81 2.77A1 1 0 0 1 34.78 2L35.97 2A1 1 0 0 1 36.94 2.77A3.4 3.4 0 0 0 43.56 2.77A1 1 0 0 1 44.53 2L45.72 2A1 1 0 0 1 46.69 2.77A3.4 3.4 0 0 0 53.31 2.77A1 1 0 0 1 54.28 2L55.47 2A1 1 0 0 1 56.44 2.77A3.4 3.4 0 0 0 63.06 2.77A1 1 0 0 1 64.03 2L65.22 2A1 1 0 0 1 66.19 2.77A3.4 3.4 0 0 0 72.81 2.77A1 1 0 0 1 73.78 2L74.97 2A1 1 0 0 1 75.94 2.77A3.4 3.4 0 0 0 82.56 2.77A1 1 0 0 1 83.53 2L84.72 2A1 1 0 0 1 85.69 2.77A3.4 3.4 0 0 0 88.23 5.31A1 1 0 0 1 89 6.28L89 7.32A1 1 0 0 1 88.23 8.29A3.4 3.4 0 0 0 88.23 14.91A1 1 0 0 1 89 15.88L89 16.92A1 1 0 0 1 88.23 17.89A3.4 3.4 0 0 0 88.23 24.51A1 1 0 0 1 89 25.48L89 26.52A1 1 0 0 1 88.23 27.49A3.4 3.4 0 0 0 88.23 34.11A1 1 0 0 1 89 35.08L89 36.12A1 1 0 0 1 88.23 37.09A3.4 3.4 0 0 0 88.23 43.71A1 1 0 0 1 89 44.68L89 45.72A1 1 0 0 1 88.23 46.69A3.4 3.4 0 0 0 88.23 53.31A1 1 0 0 1 89 54.28L89 55.32A1 1 0 0 1 88.23 56.29A3.4 3.4 0 0 0 88.23 62.91A1 1 0 0 1 89 63.88L89 64.92A1 1 0 0 1 88.23 65.89A3.4 3.4 0 0 0 88.23 72.51A1 1 0 0 1 89 73.48L89 74.52A1 1 0 0 1 88.23 75.49A3.4 3.4 0 0 0 88.23 82.11A1 1 0 0 1 89 83.08L89 84.12A1 1 0 0 1 88.23 85.09A3.4 3.4 0 0 0 88.23 91.71A1 1 0 0 1 89 92.68L89 93.72A1 1 0 0 1 88.23 94.69A3.4 3.4 0 0 0 85.69 97.23A1 1 0 0 1 84.72 98L83.53 98A1 1 0 0 1 82.56 97.23A3.4 3.4 0 0 0 75.94 97.23A1 1 0 0 1 74.97 98L73.78 98A1 1 0 0 1 72.81 97.23A3.4 3.4 0 0 0 66.19 97.23A1 1 0 0 1 65.22 98L64.03 98A1 1 0 0 1 63.06 97.23A3.4 3.4 0 0 0 56.44 97.23A1 1 0 0 1 55.47 98L54.28 98A1 1 0 0 1 53.31 97.23A3.4 3.4 0 0 0 46.69 97.23A1 1 0 0 1 45.72 98L44.53 98A1 1 0 0 1 43.56 97.23A3.4 3.4 0 0 0 36.94 97.23A1 1 0 0 1 35.97 98L34.78 98A1 1 0 0 1 33.81 97.23A3.4 3.4 0 0 0 27.19 97.23A1 1 0 0 1 26.22 98L25.03 98A1 1 0 0 1 24.06 97.23A3.4 3.4 0 0 0 17.44 97.23A1 1 0 0 1 16.47 98L15.28 98A1 1 0 0 1 14.31 97.23A3.4 3.4 0 0 0 11.77 94.69A1 1 0 0 1 11 93.72L11 92.68A1 1 0 0 1 11.77 91.71A3.4 3.4 0 0 0 11.77 85.09A1 1 0 0 1 11 84.12L11 83.08A1 1 0 0 1 11.77 82.11A3.4 3.4 0 0 0 11.77 75.49A1 1 0 0 1 11 74.52L11 73.48A1 1 0 0 1 11.77 72.51A3.4 3.4 0 0 0 11.77 65.89A1 1 0 0 1 11 64.92L11 63.88A1 1 0 0 1 11.77 62.91A3.4 3.4 0 0 0 11.77 56.29A1 1 0 0 1 11 55.32L11 54.28A1 1 0 0 1 11.77 53.31A3.4 3.4 0 0 0 11.77 46.69A1 1 0 0 1 11 45.72L11 44.68A1 1 0 0 1 11.77 43.71A3.4 3.4 0 0 0 11.77 37.09A1 1 0 0 1 11 36.12L11 35.08A1 1 0 0 1 11.77 34.11A3.4 3.4 0 0 0 11.77 27.49A1 1 0 0 1 11 26.52L11 25.48A1 1 0 0 1 11.77 24.51A3.4 3.4 0 0 0 11.77 17.89A1 1 0 0 1 11 16.92L11 15.88A1 1 0 0 1 11.77 14.91A3.4 3.4 0 0 0 11.77 8.29A1 1 0 0 1 11 7.32L11 6.28A1 1 0 0 1 11.77 5.31A3.4 3.4 0 0 0 14.31 2.77A1 1 0 0 1 15.28 2Z",
  },
  {
    key: "octagon",
    name: { de: "Achteck", en: "Octagon" },
    d: "M98 67.4A6 6 0 0 1 96.24 71.64L71.64 96.24A6 6 0 0 1 67.4 98L32.6 98A6 6 0 0 1 28.36 96.24L3.76 71.64A6 6 0 0 1 2 67.4L2 32.6A6 6 0 0 1 3.76 28.36L28.36 3.76A6 6 0 0 1 32.6 2L67.4 2A6 6 0 0 1 71.64 3.76L96.24 28.36A6 6 0 0 1 98 32.6Z",
  },
  {
    key: "triangle",
    name: { de: "Dreieck", en: "Triangle" },
    d: "M41.75 11.92A9.52 9.52 0 0 1 58.25 11.92L96.72 78.56A9.52 9.52 0 0 1 88.48 92.84L11.52 92.84A9.52 9.52 0 0 1 3.28 78.56Z",
  },
  {
    key: "diamond",
    name: { de: "Raute", en: "Diamond" },
    d: "M44.92 4.33A6.71 6.71 0 0 1 55.08 4.33L90.6 45.63A6.71 6.71 0 0 1 90.6 54.37L55.08 95.67A6.71 6.71 0 0 1 44.92 95.67L9.4 54.37A6.71 6.71 0 0 1 9.4 45.63Z",
  },
];

const KEY = /^[a-z][a-z0-9-]{0,23}$/;

/**
 * Whether a value could be a shape's key – its form only: what is stored
 * must outlive a shape taken out of the CMS.
 */
export const isShapeKey = (value: unknown): value is string =>
  typeof value === "string" && KEY.test(value);

/** Whether a path draws an outline – a closed piece that encloses something. */
export const isOutline = (d: unknown) => Boolean(ringOf(readPath(d), 1e-3));

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/**
 * A shape's names: the given one per language (one string counts for all) –
 * a missing one is the code's for that key, else another language's, else
 * the key itself.
 */
const namesOf = (key: string, given: unknown): StampShapeDef["name"] => {
  const names = (
    typeof given === "string"
      ? Object.fromEntries(LOCALES.map((locale) => [locale, given]))
      : (given ?? {})
  ) as Partial<Record<Locale, unknown>>;
  const own = DEFAULT_SHAPES.find((shape) => shape.key === key)?.name;
  const any = LOCALES.map((locale) => text(names[locale])).find(Boolean);
  return Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      text(names[locale]) || own?.[locale] || any || key,
    ])
  ) as StampShapeDef["name"];
};

/**
 * Shapes as they came from somewhere (the CMS, a page's props) – checked:
 * only those with a key and an outline, each key once (the first wins),
 * names filled in. Nothing usable gives an empty list.
 */
export const cleanShapes = (value: unknown): StampShapeDef[] => {
  if (!Array.isArray(value)) return [];
  const shapes = new Map<string, StampShapeDef>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { key, name, d } = entry as Record<string, unknown>;
    if (!isShapeKey(key) || shapes.has(key) || typeof d !== "string") continue;
    const outline = d.trim();
    if (!isOutline(outline)) continue;
    shapes.set(key, { key, name: namesOf(key, name), d: outline });
  }
  return [...shapes.values()];
};

let shapes: StampShapeDef[] = DEFAULT_SHAPES;
let byKey = new Map(shapes.map((shape) => [shape.key, shape]));

/**
 * Sets the shapes in use – while rendering (ShapesProvider), so calling it
 * again with the same shapes changes nothing, not even the list itself.
 * Nothing usable in it: ignored, the shapes stay as they are.
 */
export const setShapes = (value: unknown) => {
  const next = cleanShapes(value);
  if (!next.length || JSON.stringify(next) === JSON.stringify(shapes)) return;
  shapes = next;
  byKey = new Map(next.map((shape) => [shape.key, shape]));
};

/** The shapes, in the CMS's order – the first is the default. */
export const getShapes = (): readonly StampShapeDef[] => shapes;

/**
 * The shapes' shape for a key – or the first one for a key they don't have
 * (any more): a shape deleted in the CMS leaves its stamps in that one.
 */
export const shapeOf = (key: string): StampShapeDef =>
  byKey.get(key) ?? shapes[0] ?? DEFAULT_SHAPES[0];

/** A shape's name in a language. */
export const shapeName = (key: string, locale: Locale) =>
  shapeOf(key).name[locale];

/** The outline to draw for a shape – by its key, or given as it is. */
export const outlineOf = (shape: ShapeLike): string =>
  typeof shape === "string" ? shapeOf(shape).d : shape.d;

/**
 * A key the shapes have: the wished one – or, if they have no such shape
 * (any more), the first's. For what starts out in a shape: a new stamp.
 */
export const knownShape = (
  wished: string,
  list: readonly StampShapeDef[] = shapes
): string =>
  list.some((shape) => shape.key === wished)
    ? wished
    : (list[0] ?? DEFAULT_SHAPES[0]).key;
