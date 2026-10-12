import type { CollectionConfig } from "payload";
import { adminOnly } from "@/access";
import { idField, syncFields, touchChangedAt } from "@/features/sync/fields";
import { isDayKey } from "../model";

/**
 * Stamps put on a day of a calendar. A day's canvas is all placements with
 * its calendar and date – a day has no document of its own.
 */
export const Placements: CollectionConfig = {
  slug: "placements",
  labels: { singular: "Placement", plural: "Placements" },
  access: {
    read: adminOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  admin: {
    group: "Calendars",
    useAsTitle: "date",
    defaultColumns: ["date", "calendar", "stamp", "placedBy", "changedAt"],
    description: "Stamps placed on a calendar's days.",
  },
  // The two ways they're asked for: a calendar's day, and what changed.
  indexes: [
    { fields: ["calendar", "date"] },
    { fields: ["calendar", "updatedAt"] },
  ],
  fields: [
    idField,
    {
      name: "calendar",
      type: "relationship",
      relationTo: "calendars",
      required: true,
    },
    {
      // "2026-10-11" – the day as shown, no time or zone.
      name: "date",
      type: "text",
      required: true,
      validate: (value: unknown) => isDayKey(value) || "A day like 2026-10-11.",
    },
    {
      name: "stamp",
      type: "relationship",
      relationTo: "stamps",
      required: true,
      index: true,
    },
    {
      type: "row",
      fields: [
        { name: "x", type: "number", required: true, min: 0, max: 1 },
        { name: "y", type: "number", required: true, min: 0, max: 1 },
        { name: "rotation", type: "number", defaultValue: 0 },
        { name: "scale", type: "number", defaultValue: 1, min: 0.2, max: 4 },
        { name: "z", type: "number", defaultValue: 0 },
      ],
    },
    {
      name: "placedBy",
      type: "relationship",
      relationTo: "accounts",
    },
    ...syncFields,
  ],
  hooks: { beforeChange: [touchChangedAt] },
};
