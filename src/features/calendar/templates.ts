// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { LOCALES, type Locale } from "../../i18n/config";
import type { Art } from "./art";
import { ANCHOR, lineStroke } from "./bezier";
import { DRAWING_LIMITS, type Fill, type Stroke } from "./model";
import {
  anchorsOf,
  boxOfPieces,
  flattenPiece,
  type Point,
  readPath,
} from "./path";

/**
 * Shapes to drag into a drawing – a heart, a star, a speech bubble … – as
 * lines in the pen's width (or filled areas), picked straight away to move,
 * size and turn. Like the stamp shapes (shapes.ts) they come from the CMS
 * (“Site” → Drawing templates); the ones here are what the code knows.
 *
 * A template is an SVG path in a 100 × 100 box (y down) – one or more
 * pieces, each an M … (Z). Dropped in, each piece becomes a line with its
 * anchors kept (bezier.ts), to edit like one drawn with the line tool;
 * filled, its closed pieces become one area instead (holes where they
 * overlap – even-odd), its open ones stay lines.
 */
export type DrawingTemplate = {
  key: string;
  name: Record<Locale, string>;
  /** Its lines: an SVG path, in a 100 × 100 box. */
  d: string;
  /** Dropped in as filled areas – else as lines. */
  filled: boolean;
};

/** The code's templates – doodles, the way one would draw them. */
export const DEFAULT_TEMPLATES: DrawingTemplate[] = [
  {
    key: "heart",
    name: { de: "Herz", en: "Heart" },
    d: "M50 20.26C57.65 9.52 66.49 7.16 73.32 7.16C86.6 7.16 100 18.44 100 35.03C100 61.77 69.49 83.97 54.07 91.17C50.08 93.03 49.92 93.03 45.93 91.17C30.51 83.97 0 61.77 0 35.03C0 18.44 13.4 7.16 26.68 7.16C33.51 7.16 42.35 9.52 50 20.26Z",
    filled: false,
  },
  {
    key: "star",
    name: { de: "Stern", en: "Star" },
    d: "M50 6L61.36 36.37L93.75 37.79L68.37 57.97L77.04 89.21L50 71.32L22.96 89.21L31.63 57.97L6.25 37.79L38.64 36.37Z",
    filled: false,
  },
  {
    key: "circle",
    name: { de: "Kreis", en: "Circle" },
    d: "M95 50A45 45 0 0 1 5 50A45 45 0 0 1 95 50Z",
    filled: false,
  },
  {
    key: "square",
    name: { de: "Quadrat", en: "Square" },
    d: "M20 8H80A12 12 0 0 1 92 20V80A12 12 0 0 1 80 92H20A12 12 0 0 1 8 80V20A12 12 0 0 1 20 8Z",
    filled: false,
  },
  {
    key: "triangle",
    name: { de: "Dreieck", en: "Triangle" },
    d: "M41.75 11.92A9.52 9.52 0 0 1 58.25 11.92L96.72 78.56A9.52 9.52 0 0 1 88.48 92.84L11.52 92.84A9.52 9.52 0 0 1 3.28 78.56Z",
    filled: false,
  },
  {
    key: "moon",
    name: { de: "Mond", en: "Moon" },
    d: "M44.09 10A42 42 0 1 0 83.98 64.85A34 34 0 0 1 44.09 10Z",
    filled: true,
  },
  {
    key: "cloud",
    name: { de: "Wolke", en: "Cloud" },
    d: "M91.41 52.21A13 13 0 0 1 81 73L19 73A14 14 0 0 1 13.56 46.1A4 4 0 0 0 16.01 42.53A17 17 0 0 1 31.69 26.05A5 5 0 0 0 35.69 23.46A22 22 0 0 1 76.16 27.99A5 5 0 0 0 79.73 31.47A15 15 0 0 1 90.69 49.01A4 4 0 0 0 91.41 52.21Z",
    filled: false,
  },
  {
    key: "flower",
    name: { de: "Blume", en: "Flower" },
    d: "M29.61 16.99A21 21 0 0 1 70.39 16.99A4.5 4.5 0 0 0 75.09 20.4A21 21 0 0 1 87.7 59.19A4.5 4.5 0 0 0 85.9 64.72A21 21 0 0 1 52.9 88.69A4.5 4.5 0 0 0 47.1 88.69A21 21 0 0 1 14.1 64.72A4.5 4.5 0 0 0 12.3 59.19A21 21 0 0 1 24.91 20.4A4.5 4.5 0 0 0 29.61 16.99ZM61 52A11 11 0 0 1 39 52A11 11 0 0 1 61 52Z",
    filled: false,
  },
  {
    key: "sun",
    name: { de: "Sonne", en: "Sun" },
    d: "M68 50A18 18 0 0 1 32 50A18 18 0 0 1 68 50ZM77 50L92 50M69.09 69.09L79.7 79.7M50 77L50 92M30.91 69.09L20.3 79.7M23 50L8 50M30.91 30.91L20.3 20.3M50 23L50 8M69.09 30.91L79.7 20.3",
    filled: false,
  },
  {
    key: "bolt",
    name: { de: "Blitz", en: "Lightning" },
    d: "M58 4L22 54H46L38 96L80 40H55L66 4Z",
    filled: true,
  },
  {
    key: "drop",
    name: { de: "Tropfen", en: "Drop" },
    d: "M50 6C50 6 82 42 82 64A32 32 0 0 1 18 64C18 42 50 6 50 6Z",
    filled: true,
  },
  {
    key: "bubble",
    name: { de: "Sprechblase", en: "Speech bubble" },
    d: "M22 14H78A14 14 0 0 1 92 28V58A14 14 0 0 1 78 72H46L28 88L32 72H22A14 14 0 0 1 8 58V28A14 14 0 0 1 22 14Z",
    filled: false,
  },
  {
    key: "arrow",
    name: { de: "Pfeil", en: "Arrow" },
    d: "M10 50H86M64 28L88 50L64 72",
    filled: false,
  },
];

const KEY = /^[a-z][a-z0-9-]{0,23}$/;

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/** A template's names – filled in like a stamp shape's (shapes.ts). */
const namesOf = (key: string, given: unknown): DrawingTemplate["name"] => {
  const names = (
    typeof given === "string"
      ? Object.fromEntries(LOCALES.map((locale) => [locale, given]))
      : (given ?? {})
  ) as Partial<Record<Locale, unknown>>;
  const own = DEFAULT_TEMPLATES.find((template) => template.key === key)?.name;
  const any = LOCALES.map((locale) => text(names[locale])).find(Boolean);
  return Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      text(names[locale]) || own?.[locale] || any || key,
    ])
  ) as DrawingTemplate["name"];
};

/**
 * Templates as they came from somewhere (the CMS, a page's props) – checked:
 * only those with a key and a path that draws something, each key once.
 */
export const cleanTemplates = (value: unknown): DrawingTemplate[] => {
  if (!Array.isArray(value)) return [];
  const templates = new Map<string, DrawingTemplate>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { key, name, d, filled } = entry as Record<string, unknown>;
    if (typeof key !== "string" || !KEY.test(key) || templates.has(key)) {
      continue;
    }
    if (typeof d !== "string" || !readPath(d.trim())) continue;
    templates.set(key, {
      key,
      name: namesOf(key, name),
      d: d.trim(),
      filled: filled === true,
    });
  }
  return [...templates.values()];
};

let templates: DrawingTemplate[] = DEFAULT_TEMPLATES;

/**
 * Sets the templates in use – while rendering (ShapesProvider); the same
 * again changes nothing. Nothing usable in it: ignored.
 */
export const setTemplates = (value: unknown) => {
  const next = cleanTemplates(value);
  if (!next.length || JSON.stringify(next) === JSON.stringify(templates)) {
    return;
  }
  templates = next;
};

/** The templates, in the CMS's order. */
export const getTemplates = (): readonly DrawingTemplate[] => templates;

/** How finely a filled template's outline is kept (unit lengths). */
const FINE = 0.0015;

const round = (n: number) =>
  Math.round(Math.min(Math.max(n, 0), 1) * 1000) / 1000;

/**
 * A template as part of a drawing: centered on (x, y) – moved in as far as
 * it takes to lie on the face – its longer side `size`, its lines `width`
 * wide. Nothing for a path that draws nothing.
 */
export const templateArt = (
  template: Pick<DrawingTemplate, "d" | "filled">,
  { x, y, size, width }: { x: number; y: number; size: number; width: number }
): Art => {
  const pieces = readPath(template.d);
  if (!pieces) return { strokes: [], fills: [] };
  const box = boxOfPieces(pieces);
  const wide = box.x1 - box.x0;
  const tall = box.y1 - box.y0;
  const scale = size / Math.max(wide, tall, 1e-9);
  const room = width / 2 + 0.005;
  const keep = (at: number, half: number) =>
    half + room >= 0.5
      ? 0.5
      : Math.min(Math.max(at, half + room), 1 - half - room);
  const cx = keep(x, (wide * scale) / 2);
  const cy = keep(y, (tall * scale) / 2);
  const mx = (box.x0 + box.x1) / 2;
  const my = (box.y0 + box.y1) / 2;
  const place = ([px, py]: Point): Point => [
    cx + (px - mx) * scale,
    cy + (py - my) * scale,
  ];
  const strokes: Stroke[] = [];
  const rings: number[][] = [];
  for (const piece of pieces) {
    if (template.filled && piece.closed) {
      const ring = flattenPiece(piece, FINE / scale).flatMap((p) =>
        place(p).map(round)
      );
      if (ring.length >= 6) rings.push(ring);
      continue;
    }
    const { a, closed } = anchorsOf(piece, place);
    if (a.length / ANCHOR <= DRAWING_LIMITS.anchors) {
      strokes.push(lineStroke(width, a, closed));
    } else {
      // Too many anchors to edit: a plain line along it.
      const p = flattenPiece(piece, FINE / scale).flatMap((q) =>
        place(q).map(round)
      );
      strokes.push({ w: width, p: closed ? [...p, p[0], p[1]] : p });
    }
  }
  const fills: Fill[] = rings.length ? [{ p: rings, rule: "evenodd" }] : [];
  return { strokes, fills };
};
