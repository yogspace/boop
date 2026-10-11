import type { CollectionConfig } from "payload";
import { adminOnly } from "@/access";
import { ACTION_NAMES } from "../actions";

/**
 * What people do – one row per action (a stamp placed, a calendar shared …),
 * with the page it happened on and the device class. Anonymous like the page
 * views (see there): no IP, no identifier, nothing linking two rows – and
 * never who did it.
 *
 * Written only by /next/action (local API). Pruned with the page views.
 */
export const Actions: CollectionConfig = {
  slug: "actions",
  admin: {
    hidden: true,
    useAsTitle: "name",
    defaultColumns: ["name", "path", "device", "createdAt"],
  },
  access: {
    create: () => false,
    delete: adminOnly,
    read: adminOnly,
    update: () => false,
  },
  fields: [
    {
      name: "name",
      type: "select",
      required: true,
      index: true,
      options: [...ACTION_NAMES],
    },
    { name: "path", type: "text" },
    { name: "device", type: "text" },
  ],
};
