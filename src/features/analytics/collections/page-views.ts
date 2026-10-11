import type { CollectionConfig } from "payload";
import { adminOnly } from "@/access";

/**
 * Anonymous page views – one row per view, holding ONLY coarse dimensions
 * derived from what the browser sends by itself in every request:
 *
 *   - path:     which page (/de, /en/app …)
 *   - referrer: a coarse source group (Google, Instagram, direct …)
 *   - device:   mobile / tablet / desktop
 *   - os:       "iOS 18", "Android 14", "macOS" …
 *   - browser:  "Safari 18", "Chrome 141" …
 *
 * No IP, no identifier, nothing stored on the device – and nothing is read
 * out of the device (screen size, fonts, canvas): that would be access under
 * § 25 TDDDG, need consent and turn a coarse dimension into a fingerprint.
 * Nothing links two rows, so a row is part of an aggregate, not the trace of
 * a person. Only major versions are kept.
 *
 * Written only by /next/track (local API). Pruned after 90 days by the
 * stats-digest cron.
 */
export const PageViews: CollectionConfig = {
  slug: "page-views",
  admin: {
    hidden: true,
    useAsTitle: "path",
    defaultColumns: [
      "path",
      "referrer",
      "device",
      "os",
      "browser",
      "createdAt",
    ],
  },
  access: {
    create: () => false,
    delete: adminOnly,
    read: adminOnly,
    update: () => false,
  },
  fields: [
    { name: "path", type: "text", required: true, index: true },
    { name: "referrer", type: "text", index: true },
    { name: "device", type: "text" },
    { name: "os", type: "text" },
    { name: "browser", type: "text" },
  ],
};
