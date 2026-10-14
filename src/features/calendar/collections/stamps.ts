import type { CollectionConfig } from "payload";
import { hiddenUnlessSupport, sealed } from "@/access";
import { dropCards } from "@/features/cards/cards";
import { idField, syncFields, touchChangedAt } from "@/features/sync/fields";
import { colorField } from "../color-field";
import { SHAPES } from "../model";

/**
 * The stamps people drew – one color each, a doodle as strokes (model.ts).
 * A stamp is its owner's, always; `sharedWith` names the calendars whose
 * members may stamp with it too.
 *
 * `calendar` is how sharing was kept before (one calendar only): wherever
 * stamps are read it counts as one more of `sharedWith` (`sharedWithOf`,
 * model.ts), and the sync empties it whenever it writes a stamp's sharing.
 *
 * `origin`: where a stamp came from, when its owner didn't draw it – a card
 * taken, a gift from Boop (features/cards). Written by the server alone;
 * a device's word on it is never read (sync/apply.ts).
 *
 * The app's through the sync alone; closed over REST, for admins too – they
 * read it in support mode (src/access).
 */
export const Stamps: CollectionConfig = {
  slug: "stamps",
  labels: { singular: "Stamp", plural: "Stamps" },
  access: sealed,
  admin: {
    hidden: hiddenUnlessSupport,
    group: "Calendars",
    useAsTitle: "name",
    defaultColumns: ["name", "color", "owner", "sharedWith", "changedAt"],
    description:
      "Stamps people drew. Always their owner's – and, if shared, for the members of those calendars too.",
  },
  fields: [
    idField,
    { name: "name", type: "text", maxLength: 40 },
    colorField("color", "red"),
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
    {
      name: "origin",
      type: "group",
      admin: {
        description:
          "Where it came from, when its owner didn't draw it: a card someone sent, or a gift from Boop. A copy – the owner's own stamp.",
      },
      fields: [
        { name: "kind", type: "select", options: ["card", "gift"] },
        {
          // The giver – none for a gift, or once their account is gone.
          name: "from",
          type: "relationship",
          relationTo: "accounts",
          index: true,
        },
        // The giver's name as it was then – “Boop” for a gift.
        { name: "name", type: "text" },
        { name: "message", type: "textarea" },
        {
          // The card it was taken from – taken again, it is this one.
          name: "card",
          type: "text",
          index: true,
        },
        {
          // The gift it is – sent again, nobody gets it twice.
          name: "gift",
          type: "text",
          index: true,
        },
        {
          // The stamp it is a copy of – its maker's own. Kept for the day a
          // stamp can be changed: then a change can reach every copy.
          name: "stamp",
          type: "text",
          index: true,
        },
      ],
    },
    ...syncFields,
  ],
  hooks: { beforeChange: [touchChangedAt], afterChange: [dropCards] },
};
