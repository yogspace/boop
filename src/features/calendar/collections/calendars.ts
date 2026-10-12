import type { CollectionAfterChangeHook, CollectionConfig } from "payload";
import { adminOnly } from "@/access";
import { unshare } from "@/features/sync/apply";
import { idField, syncFields, touchChangedAt } from "@/features/sync/fields";
import { nudge, nudgeCalendars } from "@/features/sync/live";
import { colorField } from "../color-field";
import { addMember, removeMember } from "../endpoints/members";
import { inviteEndpoints } from "../invites";
import { idOf } from "../membership";

const memberIds = (doc: unknown): string[] => {
  const members = (doc as { members?: unknown } | null)?.members;
  return Array.isArray(members)
    ? members.map(idOf).filter((id): id is string => Boolean(id))
    : [];
};

/**
 * Members taken out here in the admin take their stamps along, as through
 * the member endpoint (members.ts): none stays shared with the calendar.
 * The sync and the endpoints do that themselves – their writes come with
 * `context.sync` and are left alone.
 */
const unshareLeavers: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  context,
  req,
}) => {
  if (operation !== "update" || context.sync) return doc;
  const now = new Set(memberIds(doc));
  const gone = memberIds(previousDoc).filter((id) => !now.has(id));
  if (!gone.length) return doc;
  const calendar = String(doc.id);
  for (const account of gone) await unshare(req, calendar, account);
  nudge(gone);
  await nudgeCalendars(req, [calendar]);
  return doc;
};

/**
 * Calendars. Each belongs to its owner; the members (the owner among them)
 * see it and stamp on it. Every account gets a first one at sign-up; it can
 * go like any other.
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
    afterChange: [unshareLeavers],
  },
  endpoints: [addMember, removeMember, ...inviteEndpoints],
};
