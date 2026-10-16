import type { CollectionConfig } from "payload";
import { hiddenUnlessSupport, sealed } from "@/access";
import { idField, syncFields, touchChangedAt } from "@/features/sync/fields";
import { colorField } from "../color-field";
import { CALENDAR_VIEWS } from "../prefs";

/**
 * One's own settings for a calendar (prefs.ts) – a member's color for it,
 * the view it opens in. One per account and calendar, its id made of the
 * two; the later change wins, as with everything synced. They go with the
 * calendar (sync/apply.ts), when the account leaves it (endpoints/
 * members.ts) and with the account (accounts/collection.ts).
 *
 * The app's through the sync alone; closed over REST, for admins too – they
 * read it in support mode (src/access).
 */
export const CalendarPrefs: CollectionConfig = {
  slug: "calendar-prefs",
  labels: { singular: "Own settings", plural: "Own settings" },
  access: sealed,
  admin: {
    hidden: hiddenUnlessSupport,
    group: "Calendars",
    defaultColumns: ["account", "calendar", "color", "start", "changedAt"],
    description:
      "What someone set for a calendar for themselves alone – their color for it, the view it opens in. One per account and calendar, the same on all their devices.",
  },
  indexes: [
    // One per account and calendar – the id says so already; this keeps it
    // so in the admin.
    { fields: ["account", "calendar"], unique: true },
    { fields: ["account", "updatedAt"] },
  ],
  fields: [
    idField,
    {
      name: "account",
      type: "relationship",
      relationTo: "accounts",
      required: true,
    },
    {
      name: "calendar",
      type: "relationship",
      relationTo: "calendars",
      required: true,
      index: true,
    },
    // Empty: the calendar's own.
    colorField("color"),
    {
      // Empty: the month.
      name: "start",
      type: "select",
      options: [...CALENDAR_VIEWS],
    },
    ...syncFields,
  ],
  hooks: { beforeChange: [touchChangedAt] },
};
