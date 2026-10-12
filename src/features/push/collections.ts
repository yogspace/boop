import type { CollectionConfig } from "payload";
import { adminOnly } from "@/access";
import { LOCALES } from "@/i18n/config";
import {
  cleanReminderAt,
  DEFAULT_REMINDER_AT,
  DEFAULT_TIME_ZONE,
  LATEST_REMINDER_AT,
} from "./rules";

/**
 * Notifications, kept on the server – it is the one that sends them.
 *
 * - `push-subscriptions`: the devices that said yes, one per browser – where
 *   its push service takes messages for it, the keys to encrypt them with,
 *   its clock's zone and language. Tied to the login it was switched on in
 *   (rules.ts, `loginLasts`).
 * - `push-settings`: what an account wants to hear of – its reminder's time
 *   and, per calendar, the switches it turned off. One per account, apart
 *   from the account itself: the app reads and writes it through its own
 *   endpoints (endpoints.ts), and nothing of it rides along with the login.
 *
 * Both go with the account (accounts/collection.ts, `removeData`) and are
 * in its export (accounts/export.ts). Admins only – the app goes through
 * endpoints.ts.
 */

const ADMIN_ONLY = {
  read: adminOnly,
  create: adminOnly,
  update: adminOnly,
  delete: adminOnly,
};

export const PushSubscriptions: CollectionConfig = {
  slug: "push-subscriptions",
  labels: { singular: "Push device", plural: "Push devices" },
  access: ADMIN_ONLY,
  admin: {
    group: "People",
    useAsTitle: "timeZone",
    defaultColumns: [
      "account",
      "timeZone",
      "locale",
      "remindedOn",
      "lastUsedAt",
      "createdAt",
    ],
    description:
      "Devices that get notifications – one per browser that said yes. They stop with the login they were turned on in, and go when their push service no longer knows them.",
  },
  fields: [
    {
      name: "account",
      type: "relationship",
      relationTo: "accounts",
      required: true,
      index: true,
    },
    {
      // The push service's address for this browser – a secret of sorts:
      // whoever has it (and the keys) could send it messages.
      name: "endpoint",
      type: "text",
      required: true,
      unique: true,
      admin: { readOnly: true },
    },
    {
      name: "keys",
      type: "group",
      admin: { hidden: true },
      fields: [
        { name: "p256dh", type: "text", required: true },
        { name: "auth", type: "text", required: true },
      ],
    },
    {
      // Payload's id of the login it was turned on in – logged out, it's
      // quiet (and goes at the next send).
      name: "session",
      type: "text",
      admin: { hidden: true },
    },
    {
      // The device's clock – the reminder comes at the account's time there.
      name: "timeZone",
      type: "text",
      required: true,
      defaultValue: DEFAULT_TIME_ZONE,
      admin: { readOnly: true },
    },
    {
      // The app's language on the device when it said yes.
      name: "locale",
      type: "select",
      required: true,
      defaultValue: "de",
      options: [...LOCALES],
      admin: { readOnly: true },
    },
    {
      // The device's day of its last reminder – one a day.
      name: "remindedOn",
      type: "text",
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "lastUsedAt",
      type: "date",
      admin: {
        readOnly: true,
        position: "sidebar",
        date: { pickerAppearance: "dayAndTime" },
        description:
          "When the device last said it still wants them, or a notification last reached it – once a day at most.",
      },
    },
  ],
  timestamps: true,
};

export const PushSettings: CollectionConfig = {
  slug: "push-settings",
  labels: {
    singular: "Notification settings",
    plural: "Notification settings",
  },
  access: ADMIN_ONLY,
  admin: {
    group: "People",
    useAsTitle: "reminderAt",
    defaultColumns: ["account", "reminderAt", "updatedAt"],
    description:
      "What an account wants to hear of. A calendar not listed has both on – the reminder and “someone else stamped”.",
  },
  fields: [
    {
      name: "account",
      type: "relationship",
      relationTo: "accounts",
      required: true,
      unique: true,
      index: true,
    },
    {
      // On the device's clock – each device at its own.
      name: "reminderAt",
      type: "text",
      required: true,
      defaultValue: DEFAULT_REMINDER_AT,
      validate: (value: unknown) =>
        cleanReminderAt(value) === value ||
        `A time like 20:00 – ${LATEST_REMINDER_AT} at the latest.`,
    },
    {
      // Only calendars with a switch off – kept tidy whenever written.
      name: "calendars",
      type: "array",
      fields: [
        {
          name: "calendar",
          type: "relationship",
          relationTo: "calendars",
          required: true,
        },
        {
          type: "row",
          fields: [
            { name: "reminder", type: "checkbox", defaultValue: true },
            { name: "stamped", type: "checkbox", defaultValue: true },
          ],
        },
      ],
    },
  ],
  timestamps: true,
};
