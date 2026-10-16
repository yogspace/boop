import type { Field, GlobalConfig } from "payload";
import { adminOnly, anyone } from "@/access";
import {
  DEFAULT_PALETTE,
  FINISHES,
  type Finish,
  isColorKey,
  isHex,
} from "@/features/calendar/palette";
import { readPath } from "@/features/calendar/path";
import {
  DEFAULT_SHAPES,
  isOutline,
  isShapeKey,
} from "@/features/calendar/shapes";
import { DEFAULT_TEMPLATES } from "@/features/calendar/templates";
import { isLocale } from "@/i18n/config";
import { expireOnChange, TAGS } from "@/lib/cache";
import { SITE_DEFAULTS, SITE_LINK_LABELS, type SiteLinks } from "./defaults";

/** The finishes as the select names them. */
const FINISH_LABELS: Record<Finish, string> = {
  metal: "Metal",
  glitter: "Glitter",
  holo: "Holo – a rainbow shimmer",
  wood: "Wood grain",
  confetti: "Confetti",
  stars: "Little stars",
  marble: "Marble",
  heat: "Heat – glowing like hot iron",
};

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
 * A key of a list's rows – a shape's, a template's: its form, and only once
 * among the rows.
 */
const rowKey =
  (list: "stampShapes" | "drawingTemplates", what: string) =>
  (value: unknown, { data }: { data?: unknown }) => {
    if (!isShapeKey(value)) {
      return "Lowercase letters, digits and dashes, starting with a letter – at most 24, e.g. “heart”";
    }
    const rows = (data as Record<string, unknown> | undefined)?.[list];
    const same = Array.isArray(rows)
      ? rows.filter((row) => (row as { key?: unknown } | null)?.key === value)
      : [];
    return same.length > 1 ? `Another ${what} has this key already` : true;
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
      "The owner's address for the imprint and privacy policy, the link to mxwr.de, the colors and shapes to stamp with, and the shapes to drag into a drawing.",
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
        DEFAULT_PALETTE.map(({ key, hex, name, special, finish }) => ({
          key,
          color: hex,
          name: isLocale(locale) ? name[locale] : name,
          public: !special,
          finish: finish ?? null,
        })),
      admin: {
        description:
          "The inks to pick from – for a stamp, a calendar and the ink pads, in this order. The first one is the default – and the color of anything whose own is gone. One that isn't public is for Boop's gifts (Content → Gifts): only accounts with the “Admin” box can pick it.",
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
        {
          type: "row",
          fields: [
            {
              name: "public",
              type: "checkbox",
              label: "Public",
              defaultValue: true,
              admin: {
                description:
                  "Anyone can pick it. Unticked, it is for Boop's gifts: only accounts with the “Admin” box can pick it – to draw a gift in it. Everyone sees it on what wears it.",
              },
            },
            {
              name: "finish",
              type: "select",
              options: FINISHES.map((value) => ({
                label: FINISH_LABELS[value],
                value,
              })),
              admin: {
                description:
                  "How what is drawn in it looks – the doodle and rim, on the stamp in 3D and on its prints. Only for a color that isn't public: a public one stays plain. Empty: like any other.",
              },
            },
          ],
        },
      ],
    },
    {
      name: "stampShapes",
      type: "array",
      label: "Stamp shapes",
      labels: { singular: "Shape", plural: "Shapes" },
      required: true,
      minRows: 1,
      // The code's shapes until the global is saved (shapes.ts).
      defaultValue: ({ locale }) =>
        DEFAULT_SHAPES.map(({ key, name, d }) => ({
          key,
          name: isLocale(locale) ? name[locale] : name,
          d,
        })),
      admin: {
        description:
          "The bodies a stamp can have – offered in this order when drawing one. The first is the default – and the shape of any stamp whose own is gone. Everything else – the rim along it, the rubber and block in 3D, the file for a 3D printer – is worked out from the outline. Seeds: “Stamp shapes” brings the code's.",
        initCollapsed: true,
        components: {
          RowLabel: "@/features/site/stamp-shape-field#StampShapeRowLabel",
        },
      },
      fields: [
        {
          name: "key",
          type: "text",
          required: true,
          admin: {
            description:
              "The shape's identity – stamps refer to it, e.g. “heart”. Never change or delete a key once it is in use: its stamps would turn into the first shape. To change a shape, change its outline and keep the key.",
          },
          validate: rowKey("stampShapes", "shape"),
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
        {
          name: "d",
          type: "textarea",
          label: "Outline",
          required: true,
          admin: {
            description:
              "An SVG path (its “d”), in a 100 × 100 box with y down – fit into the stamp as large as it goes, centered, so the box's size doesn't matter. Its largest closed piece (… Z) is the outline. Below: the shape as the app shows it.",
            components: {
              Field: "@/features/site/stamp-shape-field#StampShapeField",
            },
          },
          validate: (value: unknown) =>
            isOutline(value) ||
            "An SVG path with a closed piece (… Z) that encloses something",
        },
      ],
    },
    {
      name: "drawingTemplates",
      type: "array",
      label: "Drawing templates",
      labels: { singular: "Template", plural: "Templates" },
      // The code's templates until the global is saved (templates.ts).
      defaultValue: ({ locale }) =>
        DEFAULT_TEMPLATES.map(({ key, name, d, filled }) => ({
          key,
          name: isLocale(locale) ? name[locale] : name,
          d,
          filled,
        })),
      admin: {
        description:
          "Shapes to drag into a drawing – a heart, a star, a speech bubble – in this order. Dropped in, they are lines in the pen's width (each piece of the path one, to edit point by point), or filled areas. Seeds: “Drawing templates” brings the code's.",
        initCollapsed: true,
        components: {
          RowLabel: "@/features/site/stamp-shape-field#DrawingTemplateRowLabel",
        },
      },
      fields: [
        {
          name: "key",
          type: "text",
          required: true,
          validate: rowKey("drawingTemplates", "template"),
        },
        {
          name: "name",
          type: "text",
          required: true,
          localized: true,
          admin: {
            description: "Shown when pointing at it, read out aloud.",
          },
        },
        {
          name: "d",
          type: "textarea",
          label: "Lines",
          required: true,
          admin: {
            description:
              "An SVG path (its “d”), in a 100 × 100 box with y down – each piece (M …, closed with Z or open) one line. Below: what it drops into a drawing.",
            components: {
              Field: "@/features/site/stamp-shape-field#DrawingTemplateField",
            },
          },
          validate: (value: unknown) =>
            Boolean(readPath(value)) || "An SVG path that draws something",
        },
        {
          name: "filled",
          type: "checkbox",
          label: "Filled",
          defaultValue: false,
          admin: {
            description:
              "Dropped in as filled areas – its closed pieces, holes where they overlap. Unticked: as lines.",
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
