import type {
  CollectionBeforeValidateHook,
  CollectionConfig,
  Field,
} from "payload";
import { adminOnly } from "@/access";
import { readPath } from "@/features/calendar/path";
import { isOutline, isShapeKey } from "@/features/calendar/shapes";
import { expireOnChange, TAGS } from "@/lib/cache";
import { ORDER_STEP, type ShapeCollection } from "./stamp-shapes";

/**
 * The stamp shapes and the drawing templates – a document each, edited in
 * the admin (Content). The app takes them through its own server code: the
 * layout reads them for every page (get-site.ts, cached under `TAGS.shapes`),
 * the sync and the gifts check a stamp's shape against them
 * (stamp-shapes.ts). Over REST they are the admins' alone – nobody else
 * needs them there. Empty, the code's own stand in (calendar/shapes.ts,
 * calendar/templates.ts); the Seeds page brings those in (seed.ts).
 *
 * In the order of their `order` – the smallest first, and the first shape is
 * the default.
 */

/**
 * A document without a place of its own goes to the end: `ORDER_STEP` past
 * the last one. A change that doesn't mention it leaves it be.
 */
const toTheEnd =
  (slug: ShapeCollection): CollectionBeforeValidateHook =>
  async ({ data, operation, req }) => {
    if (!data || typeof data.order === "number") return data;
    if (operation === "update" && !("order" in data)) return data;
    const { docs } = await req.payload.find({
      collection: slug,
      sort: "-order",
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    });
    const last = Number(docs[0]?.order ?? 0);
    return { ...data, order: (Number.isFinite(last) ? last : 0) + ORDER_STEP };
  };

/** A key: its form (shapes.ts) – and, the database sees to it, only once. */
const key = (description?: string): Field => ({
  name: "key",
  type: "text",
  required: true,
  unique: true,
  ...(description && { admin: { description } }),
  validate: (value: unknown) =>
    isShapeKey(value) ||
    "Lowercase letters, digits and dashes, starting with a letter – at most 24, e.g. “heart”",
});

const name: Field = {
  name: "name",
  type: "text",
  required: true,
  localized: true,
  admin: {
    description:
      "Shown when pointing at it, read out aloud – one per language (switch at the top).",
  },
};

const order = (description: string): Field => ({
  name: "order",
  type: "number",
  required: true,
  admin: { position: "sidebar", description },
});

const access = {
  read: adminOnly,
  create: adminOnly,
  update: adminOnly,
  delete: adminOnly,
};

export const StampShapes: CollectionConfig = {
  slug: "stamp-shapes",
  labels: { singular: "Stamp shape", plural: "Stamp shapes" },
  // Explicit: accounts are logged-in Payload users too, and Payload's
  // default would let any of them in.
  access,
  defaultSort: "order",
  admin: {
    group: "Content",
    useAsTitle: "name",
    defaultColumns: ["name", "d", "key", "order"],
    listSearchableFields: ["name", "key"],
    description:
      "The bodies a stamp can have – offered in their order when drawing one. The first is the default – and the shape of any stamp whose own is gone. Everything else – the rim along it, the rubber and block in 3D, the file for a 3D printer – is worked out from the outline. Seeds: “Stamp shapes” brings the code's.",
  },
  fields: [
    key(
      "The shape's identity – stamps refer to it, e.g. “heart”. Never change or delete a key once it is in use: its stamps would turn into the first shape. To change a shape, change its outline and keep the key."
    ),
    name,
    {
      name: "d",
      type: "textarea",
      label: "Outline",
      required: true,
      admin: {
        description:
          "An SVG path (its “d”), in a 100 × 100 box with y down – fit into the stamp as large as it goes, centered, so the box's size doesn't matter. Its largest closed piece (… Z) is the outline. Below: the shape as the app shows it.",
        components: {
          Field: "@/features/site/stamp-shape-field#StampShapeField",
          Cell: "@/features/site/stamp-shape-field#StampShapeCell",
        },
      },
      validate: (value: unknown) =>
        isOutline(value) ||
        "An SVG path with a closed piece (… Z) that encloses something",
    },
    order(
      "Its place among the shapes – the smallest first, and the first is the default. Empty: after the last. In tens, so one fits in between."
    ),
  ],
  hooks: {
    ...expireOnChange(TAGS.shapes),
    beforeValidate: [toTheEnd("stamp-shapes")],
  },
};

export const DrawingTemplates: CollectionConfig = {
  slug: "drawing-templates",
  labels: { singular: "Drawing template", plural: "Drawing templates" },
  access,
  defaultSort: "order",
  admin: {
    group: "Content",
    useAsTitle: "name",
    defaultColumns: ["name", "d", "key", "filled", "order"],
    listSearchableFields: ["name", "key"],
    description:
      "Shapes to drag into a drawing – a heart, a star, a speech bubble – in their order. Dropped in, they are lines in the pen's width (each piece of the path one, to edit point by point), or filled areas. Seeds: “Drawing templates” brings the code's.",
  },
  fields: [
    key(),
    name,
    {
      name: "d",
      type: "textarea",
      label: "Lines",
      required: true,
      admin: {
        description:
          "An SVG path (its “d”), in a 100 × 100 box with y down – each piece (M …, closed with Z or open) one line. Below: what it drops into a drawing.",
        components: {
          Field: "@/features/site/stamp-shape-field#DrawingTemplateField",
          Cell: "@/features/site/stamp-shape-field#DrawingTemplateCell",
        },
      },
      validate: (value: unknown) =>
        Boolean(readPath(value)) || "An SVG path that draws something",
    },
    {
      name: "filled",
      type: "checkbox",
      label: "Filled",
      defaultValue: false,
      admin: {
        description:
          "Dropped in as filled areas – its closed pieces, holes where they overlap. Unticked: as lines.",
      },
    },
    order(
      "Its place among the templates – the smallest first. Empty: after the last. In tens, so one fits in between."
    ),
  ],
  hooks: {
    ...expireOnChange(TAGS.shapes),
    beforeValidate: [toTheEnd("drawing-templates")],
  },
};
