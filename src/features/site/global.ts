import type { Field, GlobalConfig } from "payload";
import { adminOnly, anyone } from "@/access";
import {
  DEFAULT_PALETTE,
  isColorKey,
  isHex,
} from "@/features/calendar/palette";
import { isLocale } from "@/i18n/config";
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
 * A stamp color's key: its form (palette.ts), and only once among the rows –
 * two colors with one key, and the second would never show.
 */
const colorKey = (value: unknown, { data }: { data?: unknown }) => {
  if (!isColorKey(value)) {
    return "Lowercase letters, digits and dashes, starting with a letter – at most 24, e.g. “mint”";
  }
  const rows = (data as { stampColors?: unknown } | undefined)?.stampColors;
  const same = Array.isArray(rows)
    ? rows.filter((row) => (row as { key?: unknown } | null)?.key === value)
    : [];
  return same.length > 1 ? "Another color has this key already" : true;
};

/**
 * What the pages link to, the owner's address and the stamp colors – in one
 * place. The legal text shows address and link through its blocks
 * (“Address”, “Site link”), so a move changes one form, not every paragraph;
 * the colors reach every page through its frame ([locale]/layout.tsx →
 * PaletteProvider). Readable by anyone: it is all on the public pages
 * anyway.
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
      "The owner's address for the imprint and privacy policy, the link to mxwr.de, and the colors to stamp with.",
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
      name: "stampColors",
      type: "array",
      label: "Stamp colors",
      labels: { singular: "Color", plural: "Colors" },
      // At least one – `minRows` alone lets an empty list through.
      required: true,
      minRows: 1,
      // The code's colors until the global is saved – a name in the language
      // asked for, or (locale "all") in every one, as a localized field comes.
      defaultValue: ({ locale }) =>
        DEFAULT_PALETTE.map(({ key, hex, name }) => ({
          key,
          color: hex,
          name: isLocale(locale) ? name[locale] : name,
        })),
      admin: {
        description:
          "The inks to pick from – for a stamp, a calendar and the ink pads, in this order. The first one is the default – and the color of anything whose own is gone.",
        initCollapsed: true,
        components: {
          RowLabel: "@/features/site/stamp-color-field#StampColorRowLabel",
        },
      },
      fields: [
        {
          name: "key",
          type: "text",
          required: true,
          admin: {
            description:
              "The color's identity – stamps, calendars and prints refer to it, e.g. “mint”. Never change or delete a key once it is in use: whatever wears it would turn into the first color. To change a color, change its hex and name and keep the key – everything in it follows.",
          },
          validate: colorKey,
        },
        {
          name: "color",
          type: "text",
          label: "Color",
          required: true,
          admin: {
            description:
              "As #rrggbb, e.g. #22c993 – or pick it. Below: a stamp in it, as the app shows it.",
            components: {
              Field: "@/features/site/stamp-color-field#StampColorField",
            },
          },
          validate: (value: unknown) =>
            isHex(value) ? true : "A color as #rrggbb",
        },
        {
          name: "name",
          type: "text",
          required: true,
          localized: true,
          admin: {
            description:
              "Shown when pointing at it, read out aloud – one per language (switch at the top).",
          },
        },
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
