import type { CollectionConfig } from "payload";
import { hiddenUnlessSupport, sealed } from "@/access";
import { notifyCalendarChanged } from "@/features/push/changed";
import { idField, syncFields, touchChangedAt } from "@/features/sync/fields";
import { colorField } from "../color-field";
import { addMember, removeMember } from "../endpoints/members";
import { inviteEndpoints } from "../invites";

/**
 * Calendars. Each belongs to its owner; the members (the owner among them)
 * see it and stamp on it. Every account gets a first one at sign-up; it can
 * go like any other.
 *
 * Read and written by the app only through the sync (features/sync) and the
 * member endpoints. Over REST it is closed, for admins too – they read it in
 * support mode alone (src/access), and change nothing: a member leaves and
 * a calendar goes in the app, which sees to their stamps and prints.
 */
export const Calendars: CollectionConfig = {
  slug: "calendars",
  labels: { singular: "Calendar", plural: "Calendars" },
  access: sealed,
  admin: {
    hidden: hiddenUnlessSupport,
    group: "Calendars",
    useAsTitle: "name",
    defaultColumns: ["name", "color", "owner", "members", "changedAt"],
    description:
      "People's calendars. Members see and stamp a calendar; the owner names it, shares it and deletes it.",
  },
  fields: [
    idField,
    { name: "name", type: "text", required: true, maxLength: 60 },
    colorField("color", "coral"),
    {
      name: "owner",
      type: "relationship",
      relationTo: "accounts",
      required: true,
      index: true,
    },
    {
      // The owner is always among them.
      name: "members",
      type: "relationship",
      relationTo: "accounts",
      hasMany: true,
      index: true,
    },
    {
      name: "personal",
      type: "checkbox",
      defaultValue: false,
      admin: {
        readOnly: true,
        description:
          "Made at sign-up, from when that one couldn't be deleted. No longer used.",
      },
    },
    ...syncFields,
  ],
  hooks: {
    beforeChange: [
      touchChangedAt,
      // The owner is a member, whatever else changes.
      ({ data }) => {
        const owner = data.owner;
        if (!owner) return data;
        const members: unknown[] = Array.isArray(data.members)
          ? data.members
          : [];
        const ids = members.map((m) =>
          typeof m === "object" && m !== null ? (m as { id: string }).id : m
        );
        return ids.includes(owner)
          ? data
          : { ...data, members: [...ids, owner] };
      },
    ],
    // Renamed, someone in or out: the other members hear of it (push).
    afterChange: [notifyCalendarChanged],
  },
  endpoints: [addMember, removeMember, ...inviteEndpoints],
};
