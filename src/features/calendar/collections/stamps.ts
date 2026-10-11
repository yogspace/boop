import type { CollectionConfig } from "payload";
import { adminOnly } from "@/access";
import { idField, syncFields, touchChangedAt } from "@/features/sync/fields";
import { COLOR_NAMES } from "../model";

/**
 * The stamps people drew – one color each, a doodle as strokes (model.ts).
 * A stamp is its owner's own, or – with `calendar` set – shared with that
 * calendar's members.
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
    defaultColumns: ["name", "color", "owner", "calendar", "changedAt"],
    description:
      "Stamps people drew. Their own – or shared with a calendar's members.",
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
      name: "calendar",
      type: "relationship",
      relationTo: "calendars",
      index: true,
      admin: { description: "Shared with this calendar – empty: personal." },
    },
    ...syncFields,
  ],
  hooks: { beforeChange: [touchChangedAt] },
};
