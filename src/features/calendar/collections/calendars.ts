import type { CollectionConfig } from "payload";
import { adminOnly } from "@/access";
import { idField, syncFields, touchChangedAt } from "@/features/sync/fields";
import { addMember, removeMember } from "../endpoints/members";
import { inviteEndpoints } from "../invites";
import { COLOR_NAMES } from "../model";

/**
 * Calendars. Each belongs to its owner; the members (the owner among them)
 * see it and stamp on it. Every account gets a personal one at sign-up.
 *
 * Read and written by the app only through the sync (features/sync) and the
 * member endpoints – plain REST access is for the admin.
 */
export const Calendars: CollectionConfig = {
  slug: "calendars",
  labels: { singular: "Calendar", plural: "Calendars" },
  access: {
    read: adminOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  admin: {
    group: "Calendars",
    useAsTitle: "name",
    defaultColumns: ["name", "owner", "members", "personal", "changedAt"],
    description:
      "People's calendars. Members see and stamp a calendar; the owner names it, shares it and deletes it.",
  },
  fields: [
    idField,
    { name: "name", type: "text", required: true, maxLength: 60 },
    {
      name: "color",
      type: "select",
      required: true,
      defaultValue: "coral",
      options: COLOR_NAMES,
    },
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
        description: "Made at sign-up – can't be deleted.",
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
  },
  endpoints: [addMember, removeMember, ...inviteEndpoints],
};
