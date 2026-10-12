import type { CollectionConfig } from "payload";

/**
 * The private addresses calendar apps fetch a calendar from – one per
 * account and calendar, made (and taken back) in the calendar's settings.
 *
 * The token in the address is the only key: whoever has it reads the
 * calendar, without a login. It is kept as it is, not hashed – on purpose:
 * the settings show the address again, on any device, for as long as it is
 * good, and a hash couldn't be shown. In exchange it is a long random one
 * (192 bits), it opens one calendar to read and nothing else, and it is
 * replaced or taken back with a tap.
 *
 * Nobody reaches this collection through the API – not accounts, not the
 * admin: every operation is refused, and the admin doesn't list it. Only
 * the server's own code reads and writes it (`overrideAccess`; store.ts,
 * endpoints.ts). A feed goes with its account (accounts/collection.ts,
 * `removeData`) and is in its export, without the token
 * (accounts/export.ts).
 */

const nobody = () => false;

export const CalendarFeeds: CollectionConfig = {
  slug: "calendar-feeds",
  labels: { singular: "Calendar feed", plural: "Calendar feeds" },
  access: {
    read: nobody,
    create: nobody,
    update: nobody,
    delete: nobody,
    readVersions: nobody,
  },
  admin: { hidden: true },
  // One address per account and calendar.
  indexes: [{ fields: ["account", "calendar"], unique: true }],
  fields: [
    {
      name: "account",
      type: "relationship",
      relationTo: "accounts",
      required: true,
      index: true,
    },
    {
      name: "calendar",
      type: "relationship",
      relationTo: "calendars",
      required: true,
      index: true,
    },
    {
      // The address's key (rules.ts, `newToken`) – never logged, never in
      // the account's export.
      name: "token",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
    {
      // When a calendar app last asked – noted once a day at most.
      name: "lastFetchedAt",
      type: "date",
    },
  ],
  // `createdAt`: since when the address is good.
  timestamps: true,
};
