import type {
  DefaultNodeTypes,
  SerializedBlockNode,
  SerializedInlineBlockNode,
} from "@payloadcms/richtext-lexical";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import {
  type JSXConvertersFunction,
  RichText,
} from "@payloadcms/richtext-lexical/react";
import type { SiteContent, SiteLinks } from "@/features/site/defaults";
import type { Locale } from "@/i18n/config";

type SiteLinkFields = { link: keyof SiteLinks; label: string };

type Nodes =
  | DefaultNodeTypes
  | SerializedBlockNode<{ blockType: "address" }>
  | SerializedInlineBlockNode<
      | ({ blockType: "siteLink" } & SiteLinkFields)
      | { blockType: "email" }
      | { blockType: "updated" }
    >;

type Props = {
  data: SerializedEditorState;
  site: SiteContent;
  locale: Locale;
  /** When the text was last saved – for the “Last updated” block. */
  updatedAt: string;
};

/**
 * The legal text from the CMS as the page draws it, on the server. The
 * default converters give headings, paragraphs, lists and links – styled by
 * the page around them; the text's own blocks (blocks.ts) get theirs here,
 * their values from the “Site” global.
 */
export const LegalContent = ({ data, site, locale, updatedAt }: Props) => {
  const converters: JSXConvertersFunction<Nodes> = ({ defaultConverters }) => ({
    ...defaultConverters,
    blocks: {
      address: () => (
        <address>
          {site.address.name}
          <br />
          {site.address.street}
          <br />
          {site.address.city}
          <br />
          {site.address.country}
        </address>
      ),
    },
    inlineBlocks: {
      email: () =>
        site.contact.email ? (
          <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
        ) : null,
      siteLink: ({ node }) => {
        const { link, label } = node.fields as unknown as SiteLinkFields;
        const href = site.links[link];
        return href ? (
          <a href={href} rel="noopener" target="_blank">
            {label}
          </a>
        ) : (
          label
        );
      },
      updated: () => (
        <time dateTime={updatedAt}>
          {new Date(updatedAt).toLocaleDateString(
            locale === "de" ? "de-DE" : "en-GB",
            {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "Europe/Berlin",
            }
          )}
        </time>
      ),
    },
  });
  return <RichText converters={converters} data={data} disableContainer />;
};
