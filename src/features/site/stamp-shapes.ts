import type { PayloadRequest } from "payload";
// Relative, not `@/…`: the unit tests import this without the app's aliases.
import {
  cleanShapes,
  DEFAULT_SHAPES,
  type StampShapeDef,
} from "../calendar/shapes";
import {
  cleanTemplates,
  DEFAULT_TEMPLATES,
  type DrawingTemplate,
} from "../calendar/templates";

/**
 * The stamp shapes' rows as the “Site” global keeps them, checked
 * (shapes.ts): a row without a proper key or outline is left out, a name
 * missing in a language filled in – and with no row left, the code's own
 * shapes.
 */
export const stampShapesOf = (stored: unknown): StampShapeDef[] => {
  const shapes = cleanShapes(stored);
  return shapes.length ? shapes : DEFAULT_SHAPES;
};

/**
 * The shapes to drag into a drawing as the global keeps them, checked
 * (templates.ts) – with no row left, the code's own.
 */
export const drawingTemplatesOf = (stored: unknown): DrawingTemplate[] => {
  const templates = cleanTemplates(stored);
  return templates.length ? templates : DEFAULT_TEMPLATES;
};

/** The CMS's shapes, read straight from the database – the code's without. */
export const stampShapesNow = async (req: PayloadRequest) => {
  const site = (await req.payload
    .findGlobal({ slug: "site", depth: 0, overrideAccess: true, req })
    .catch(() => null)) as { stampShapes?: unknown } | null;
  return stampShapesOf(site?.stampShapes);
};

/**
 * The keys a stamp may be in: the CMS's shapes – and the code's, which a
 * device may know before the CMS has them (a seed not yet run). Read
 * straight from the database; the code's first while it is out of reach.
 */
export const shapeKeysNow = async (req: PayloadRequest): Promise<string[]> => {
  const shapes = await stampShapesNow(req);
  return [
    ...new Set([
      ...shapes.map((shape) => shape.key),
      ...DEFAULT_SHAPES.map((shape) => shape.key),
    ]),
  ];
};
