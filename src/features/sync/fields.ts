import type { CollectionBeforeChangeHook, Field } from "payload";
import { newId } from "@/lib/id";

/**
 * What every synced document has (calendars, stamps, placements): an id made
 * on the device that created it, the time of its last change there, and a
 * deleted marker. See sync/endpoint.ts for how devices and server agree.
 */

/** The id – made on the device, so it is the same offline and online. */
export const idField: Field = {
  name: "id",
  type: "text",
  required: true,
  defaultValue: () => newId(),
  admin: { readOnly: true },
};

export const syncFields: Field[] = [
  {
    // When it was last changed, on the device that changed it. The later
    // change wins; the server's own `updatedAt` is only for "what's new".
    name: "changedAt",
    type: "date",
    required: true,
    index: true,
    defaultValue: () => new Date().toISOString(),
    admin: {
      readOnly: true,
      position: "sidebar",
      date: { pickerAppearance: "dayAndTime" },
    },
  },
  {
    // Removed – kept as a marker (without its content) so the other devices
    // remove it too.
    name: "deleted",
    type: "checkbox",
    defaultValue: false,
    index: true,
    admin: { readOnly: true, position: "sidebar" },
  },
];

/**
 * A change made here in the admin (not by a device) counts as the newest –
 * so the devices take it over at their next sync.
 */
export const touchChangedAt: CollectionBeforeChangeHook = ({
  data,
  context,
}) => {
  if (context.sync) return data;
  return { ...data, changedAt: new Date().toISOString() };
};
