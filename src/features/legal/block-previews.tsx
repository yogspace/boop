"use client";

import { useBlockComponentContext } from "@payloadcms/richtext-lexical/client";
import {
  $getNearestNodeFromDOMNode,
  getNearestEditorFromDOMNode,
} from "@payloadcms/richtext-lexical/lexical";
import { useConfig } from "@payloadcms/ui";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { SiteContent, SiteLinks } from "@/features/site/defaults";

/**
 * The legal text's blocks in the admin's editor (blocks.ts) – showing what
 * the page will show instead of an empty box: the address from the “Site”
 * global, the form, the linked words, the date.
 */

type StoredSite = { [K in keyof SiteContent]?: Partial<SiteContent[K]> };

let siteRequest: Promise<StoredSite> | null = null;

/** The “Site” global, loaded once for all blocks on the page. */
const loadSite = (api: string) => {
  siteRequest ??= fetch(`${api}/globals/site?depth=0`, {
    credentials: "include",
  })
    .then((response) => (response.ok ? response.json() : {}))
    .catch(() => ({}));
  return siteRequest;
};

const useSite = () => {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const [site, setSite] = useState<StoredSite | null>(null);
  useEffect(() => {
    loadSite(api).then(setSite);
  }, [api]);
  return site;
};

/** Where the “Site” global is edited. */
const useSiteHref = () => {
  const {
    config: {
      routes: { admin },
    },
  } = useConfig();
  return `${admin}/globals/site`;
};

const hint: CSSProperties = {
  color: "var(--theme-elevation-500)",
  fontSize: 12,
  margin: "10px 0 0",
};

const preview: CSSProperties = {
  fontStyle: "normal",
  lineHeight: 1.5,
  color: "var(--theme-elevation-600)",
};

const inline: CSSProperties = {
  fontWeight: 600,
  color: "var(--theme-text)",
  textDecoration: "underline",
  textUnderlineOffset: 2,
};

/** “Address”: the address as the page shows it, and where to change it. */
export const AddressBlockPreview = () => {
  const { BlockCollapsible } = useBlockComponentContext();
  const site = useSite();
  const href = useSiteHref();
  const address = site?.address;
  return (
    <BlockCollapsible>
      <address style={preview}>
        {address ? (
          <>
            {address.name}
            <br />
            {address.street}
            <br />
            {address.city}
            <br />
            {address.country}
          </>
        ) : (
          "…"
        )}
      </address>
      <p style={hint}>
        From <a href={href}>Site → Address</a> – the same in every place.
      </p>
    </BlockCollapsible>
  );
};

/** A sketch of a form's box – what the field or button will be. */
const box = (extra: CSSProperties = {}): CSSProperties => ({
  display: "block",
  padding: "6px 10px",
  border: "1px solid var(--theme-elevation-250)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--theme-elevation-500)",
  ...extra,
});

/** “Contact form”: a sketch of the form the page shows here. */
export const ContactFormBlockPreview = () => {
  const { BlockCollapsible } = useBlockComponentContext();
  return (
    <BlockCollapsible>
      <div
        aria-hidden
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          maxWidth: 420,
        }}
      >
        <span style={box()}>Name</span>
        <span style={box()}>Email</span>
        <span style={box({ gridColumn: "1 / -1", height: 56 })}>Message</span>
        <span
          style={box({
            justifySelf: "start",
            borderRadius: 999,
            fontWeight: 600,
            color: "var(--theme-text)",
          })}
        >
          Send
        </span>
      </div>
      <p style={hint}>
        The contact form – its texts live in the code (DE and EN). Messages go
        by email to MAIL_CONTACT_RECIPIENT; nothing is stored.
      </p>
    </BlockCollapsible>
  );
};

/**
 * The fields of the inline block a label sits in. The label component gets
 * none and is rendered outside the block's context, so it asks Lexical: the
 * nearest node to its own DOM element – and again after every edit.
 */
const useInlineFields = <T,>() => {
  const ref = useRef<HTMLSpanElement>(null);
  const [fields, setFields] = useState<Partial<T>>({});
  useEffect(() => {
    const dom = ref.current;
    const editor = dom && getNearestEditorFromDOMNode(dom);
    if (!(dom && editor)) return;
    const read = () =>
      editor.read(() => {
        const node = $getNearestNodeFromDOMNode(dom) as {
          getFields?: () => Partial<T>;
        } | null;
        setFields(node?.getFields?.() ?? {});
      });
    read();
    return editor.registerUpdateListener(read);
  }, []);
  return [ref, fields] as const;
};

/** A site link inside a sentence: the linked words, with a little arrow. */
export const SiteLinkLabel = () => {
  const [ref, { label, link }] = useInlineFields<{
    label: string;
    link: keyof SiteLinks;
  }>();
  const site = useSite();
  return (
    <span ref={ref} style={inline} title={link && site?.links?.[link]}>
      {label || "Site link"} ↗
    </span>
  );
};

/** “Last updated”: the date fills in by itself. */
export const UpdatedLabel = () => (
  <span style={inline} title="Filled in when the text is shown">
    📅 last saved
  </span>
);
