import type { CollectionConfig } from "payload";
import { adminOnly } from "@/access";
import { idField, syncFields, touchChangedAt } from "@/features/sync/fields";
import { COLOR_NAMES, SHAPES } from "../model";

/**
 * The stamps people drew – one color each, a doodle as strokes (model.ts).
 * A stamp is its owner's, always; `sharedWith` names the calendars whose
 * members may stamp with it too.
 *
 * `calendar` is how sharing was kept before (one calendar only): wherever
 * stamps are read it counts as one more of `sharedWith` (`sharedWithOf`,
 * model.ts), and the sync empties it whenever it writes a stamp's sharing.
 */
export const Stamps: CollectionConfig = {
  slug: "stamps",
  labels: { singular: "Stamp", plural: "Stamps" },
  access: {
    read: adminOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  admin: {
    group: "Calendars",
    useAsTitle: "name",
    defaultColumns: ["name", "color", "owner", "sharedWith", "changedAt"],
    description:
      "Stamps people drew. Always their owner's – and, if shared, for the members of those calendars too.",
  },
  fields: [
    idField,
    { name: "name", type: "text", maxLength: 40 },
    {
      name: "color",
      type: "select",
      required: true,
      defaultValue: "ink",
      options: COLOR_NAMES,
    },
    {
      // The stamp's body the doodle is drawn on.
      name: "shape",
      type: "select",
      required: true,
      defaultValue: "circle",
      options: [...SHAPES],
    },
    {
      // { v: 1, strokes: [{ w, p: [x0, y0, x1, y1, …] }] } in a unit square.
      name: "drawing",
      type: "json",
    },
    {
      name: "owner",
      type: "relationship",
      relationTo: "accounts",
      required: true,
      index: true,
    },
    {
      name: "sharedWith",
      type: "relationship",
      relationTo: "calendars",
      hasMany: true,
      index: true,
      admin: {
        description:
          "These calendars' members may stamp with it too – empty: only its owner.",
      },
    },
    {
      name: "calendar",
      type: "relationship",
      relationTo: "calendars",
      index: true,
      admin: {
        description:
          "Legacy – from before a stamp could be shared with several calendars. Counts as one more of “Shared with”.",
      },
    },
    ...syncFields,
  ],
  hooks: { beforeChange: [touchChangedAt] },
};
