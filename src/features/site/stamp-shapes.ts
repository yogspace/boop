import type { Payload, PayloadRequest } from "payload";
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

/** The two collections (collections.ts). */
export type ShapeCollection = "stamp-shapes" | "drawing-templates";

/**
 * How far apart the documents' places (`order`) are made – a new one lands
 * this far past the last, so another fits in between.
 */
export const ORDER_STEP = 10;

const placeOf = (doc: unknown) => {
  const order = (doc as { order?: unknown } | null)?.order;
  return typeof order === "number" && Number.isFinite(order)
    ? order
    : Number.POSITIVE_INFINITY;
};

const madeAt = (doc: unknown) =>
  String((doc as { createdAt?: unknown } | null)?.createdAt ?? "");

/**
 * Documents in their order: by `order`, the smallest first – one without
 * comes last – and two in the same place by when they were made.
 */
export const inOrder = <T>(docs: readonly T[]): T[] =>
  [...docs].sort(
    (a, b) => placeOf(a) - placeOf(b) || madeAt(a).localeCompare(madeAt(b))
  );

/**
 * A collection's documents as they are kept, in their order – the names in
 * every language (locale "all": a localized field comes as { de, en }).
 */
const rowsOf = async (
  payload: Payload,
  collection: ShapeCollection,
  req?: PayloadRequest
) => {
  const { docs } = await payload.find({
    collection,
    locale: "all",
    depth: 0,
    pagination: false,
    sort: "order",
    overrideAccess: true,
    ...(req && { req }),
  });
  return inOrder(docs as unknown[]);
};

/**
 * The stamp shapes as the CMS keeps them, checked (shapes.ts): one without
 * a proper key or outline is left out, a name missing in a language filled
 * in – and with none left, the code's own shapes.
 */
export const stampShapesOf = (stored: unknown): StampShapeDef[] => {
  const shapes = cleanShapes(stored);
  return shapes.length ? shapes : DEFAULT_SHAPES;
};

/**
 * The shapes to drag into a drawing as the CMS keeps them, checked
 * (templates.ts) – with none left, the code's own.
 */
export const drawingTemplatesOf = (stored: unknown): DrawingTemplate[] => {
  const templates = cleanTemplates(stored);
  return templates.length ? templates : DEFAULT_TEMPLATES;
};

/**
 * Both lists, read straight from the database – what the pages cache
 * (get-site.ts). Throws while the database is out of reach.
 */
export const shapesFrom = async (payload: Payload) => {
  const [shapes, templates] = await Promise.all([
    rowsOf(payload, "stamp-shapes"),
    rowsOf(payload, "drawing-templates"),
  ]);
  return {
    stampShapes: stampShapesOf(shapes),
    drawingTemplates: drawingTemplatesOf(templates),
  };
};

/** The CMS's shapes, read straight from the database – the code's without. */
export const stampShapesNow = async (req: PayloadRequest) =>
  stampShapesOf(await rowsOf(req.payload, "stamp-shapes", req).catch(() => []));

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
