import type { CollectionConfig } from "payload";
import { adminOnly } from "@/access";

/**
 * The admins – the logins of the CMS. Nobody else gets in: the people using
 * Boop are `accounts`, a collection of their own.
 */
export const Users: CollectionConfig = {
  slug: "users",
  labels: { singular: "Admin", plural: "Admins" },
  access: {
    admin: adminOnly,
    create: adminOnly,
    read: adminOnly,
    update: adminOnly,
    delete: adminOnly,
    unlock: adminOnly,
  },
  admin: {
    group: "People",
    defaultColumns: ["name", "email"],
    useAsTitle: "email",
  },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
  },
  fields: [{ name: "name", type: "text" }],
  timestamps: true,
};
