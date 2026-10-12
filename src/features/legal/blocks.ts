import type { Block } from "payload";
import { SITE_LINK_LABELS, type SiteLinks } from "@/features/site/defaults";

/**
 * The legal text's own building blocks (global.ts, drawn by
 * legal-content.tsx). They keep what belongs elsewhere out of the text: the
 * address and the links live in the “Site” global, the form is the form,
 * the date keeps itself.
 */

const PREVIEWS = "@/features/legal/block-previews";

/** The owner's address from the “Site” global – used several times, kept once. */
export const AddressBlock: Block = {
  slug: "address",
  labels: { singular: "Address", plural: "Addresses" },
  admin: {
    disableBlockName: true,
    components: { Block: `${PREVIEWS}#AddressBlockPreview` },
  },
  fields: [],
};

/** The contact form (contact-form.tsx), where the block sits. */
export const ContactFormBlock: Block = {
  slug: "contactForm",
  labels: { singular: "Contact form", plural: "Contact forms" },
  admin: {
    disableBlockName: true,
    components: { Block: `${PREVIEWS}#ContactFormBlockPreview` },
  },
  fields: [],
};

/** A link inside a sentence to one of the site's links (“mxwr.de”). */
export const SiteLinkBlock: Block = {
  slug: "siteLink",
  labels: { singular: "Site link", plural: "Site links" },
  admin: {
    disableBlockName: true,
    components: { Label: `${PREVIEWS}#SiteLinkLabel` },
  },
  fields: [
    {
      name: "link",
      type: "select",
      required: true,
      options: (Object.keys(SITE_LINK_LABELS) as (keyof SiteLinks)[]).map(
        (value) => ({ value, label: SITE_LINK_LABELS[value] })
      ),
    },
    {
      name: "label",
      type: "text",
      required: true,
      admin: { description: "The linked words, e.g. “mxwr.de”." },
    },
  ],
};

/** The date the legal text was last saved – “Stand: 11. Oktober 2026”. */
export const UpdatedBlock: Block = {
  slug: "updated",
  labels: { singular: "Last updated", plural: "Last updated" },
  admin: {
    disableBlockName: true,
    components: { Label: `${PREVIEWS}#UpdatedLabel` },
  },
  fields: [],
};
