import type { CollectionConfig } from "payload";
import { adminOnly } from "@/access";
import { idField, syncFields, touchChangedAt } from "@/features/sync/fields";
import { isDayKey } from "../model";
import { cleanNote } from "../note";

/**
 * What happened on a day of a calendar, in a few words – one note per day,
 * written by all its members (the later change wins, as with everything
 * synced). Its id is made of calendar and day (note.ts), so the day has one
 * on every device too; emptied, it is deleted – a marker without its text –
 * and may be written again. Goes with its calendar (sync/apply.ts).
 */
export const Notes: CollectionConfig = {
  slug: "notes",
  labels: { singular: "Note", plural: "Notes" },
  access: {
    read: adminOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  admin: {
    group: "Calendars",
    useAsTitle: "date",
    defaultColumns: ["date", "calendar", "editedBy", "changedAt"],
    description: "What happened on a calendar's day – one note per day.",
  },
  indexes: [
    // One per day – the id says so already; this keeps it so in the admin.
    { fields: ["calendar", "date"], unique: true },
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
      // "2026-10-11" – the day as shown, like a placement's.
      name: "date",
      type: "text",
      required: true,
      validate: (value: unknown) => isDayKey(value) || "A day like 2026-10-11.",
    },
    {
      // Lines of runs ({ text, b?, u? }) – never HTML. Checked whoever
      // writes it, the admin too; null on a marker. Left alone by a change
      // that doesn't touch it.
      name: "content",
      type: "json",
      hooks: {
        beforeChange: [
          ({ value }) => (value === undefined ? undefined : cleanNote(value)),
        ],
      },
    },
    {
      // Who wrote last.
      name: "editedBy",
      type: "relationship",
      relationTo: "accounts",
    },
    ...syncFields,
  ],
  hooks: { beforeChange: [touchChangedAt] },
};
