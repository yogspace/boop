import type { Field, GlobalConfig } from "payload";
import { adminOnly, anyone } from "@/access";
import { expireOnChange, TAGS } from "@/lib/cache";
import { SITE_DEFAULTS, SITE_LINK_LABELS, type SiteLinks } from "./defaults";

const link = (name: keyof SiteLinks, description: string): Field => ({
  name,
  type: "text",
  label: SITE_LINK_LABELS[name],
  required: true,
  defaultValue: SITE_DEFAULTS.links[name],
  admin: { description },
  validate: (value: unknown) =>
    typeof value === "string" && /^https:\/\/\S+$/.test(value)
      ? true
      : "A full address starting with https://",
});

/** A required line of the owner's address, the code's version as default. */
const addressLine = (
  name: keyof typeof SITE_DEFAULTS.address,
  label?: string
): Field => ({
  name,
  type: "text",
  ...(label && { label }),
  required: true,
  defaultValue: SITE_DEFAULTS.address[name],
});

/**
 * What the pages link to, and the owner's address – in one place. The legal
 * text shows them through its blocks (“Address”, “Site link”), so a move
 * changes one form, not every paragraph. Readable by anyone: it is all on
 * the public imprint anyway.
 */
export const Site: GlobalConfig = {
  slug: "site",
  label: "Site",
  // Explicit: accounts are logged-in Payload users too, and Payload's
  // default would let any of them write here.
  access: { read: anyone, readVersions: adminOnly, update: adminOnly },
  hooks: expireOnChange(TAGS.site),
  admin: {
    group: "Settings",
    description:
      "The owner's address for the imprint and privacy policy, and the link to mxwr.de.",
  },
  fields: [
    {
      name: "address",
      type: "group",
      admin: {
        description:
          "Shown wherever the legal text has an “Address” block (§ 5 DDG, § 18 MStV, the privacy policy's controller).",
      },
      fields: [
        addressLine("name"),
        addressLine("street"),
        addressLine("city", "Postcode and city"),
        addressLine("country"),
      ],
    },
    {
      name: "links",
      type: "group",
      admin: { position: "sidebar" },
      fields: [
        link(
          "website",
          "The legal text's “Site link”. Keep the utm part – it shows where visits came from."
        ),
      ],
    },
  ],
};
