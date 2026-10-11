import {
  BlocksFeature,
  BoldFeature,
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  lexicalEditor,
  OrderedListFeature,
  ParagraphFeature,
  UnorderedListFeature,
} from "@payloadcms/richtext-lexical";
import type { GlobalConfig } from "payload";
import { adminOnly, anyone } from "@/access";
import { expireOnChange, TAGS } from "@/lib/cache";
import {
  AddressBlock,
  EmailBlock,
  SiteLinkBlock,
  UpdatedBlock,
} from "./blocks";

/**
 * Imprint and privacy policy – the page /de/legal and /en/legal, in German
 * and English (locale at the top of the admin).
 *
 * The editor has what the page draws and nothing else, so the text can't
 * look any different from the rest of it: big headings (h2) for the parts,
 * small ones (h3) for the sections, paragraphs, bold and italic, lists and
 * links. Plus the blocks of blocks.ts – address, email and links come from
 * the “Site” global, and “Last updated” keeps the date by itself.
 *
 * While a language has no text, the page shows the code's (seed-content.ts);
 * the Seeds page writes it in here.
 */
export const Legal: GlobalConfig = {
  slug: "legal",
  label: "Imprint & privacy",
  // Explicit: accounts are logged-in Payload users too, and Payload's
  // default would let any of them write here.
  access: { read: anyone, readVersions: adminOnly, update: adminOnly },
  hooks: expireOnChange(TAGS.legal),
  admin: {
    group: "Content",
    description:
      "The page behind “Imprint & privacy”. Address, email and links come from “Site”; switch the language at the top.",
  },
  fields: [
    {
      name: "content",
      type: "richText",
      localized: true,
      required: true,
      editor: lexicalEditor({
        features: [
          ParagraphFeature(),
          HeadingFeature({ enabledHeadingSizes: ["h2", "h3"] }),
          BoldFeature(),
          ItalicFeature(),
          UnorderedListFeature(),
          OrderedListFeature(),
          // External links only – there are no documents to link to.
          LinkFeature({ enabledCollections: [] }),
          BlocksFeature({
            blocks: [AddressBlock],
            inlineBlocks: [EmailBlock, SiteLinkBlock, UpdatedBlock],
          }),
          FixedToolbarFeature(),
          InlineToolbarFeature(),
        ],
      }),
    },
  ],
};
