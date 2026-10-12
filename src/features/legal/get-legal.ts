import config from "@payload-config";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import { unstable_cache } from "next/cache";
import { getPayload } from "payload";
import { LOCALES, type Locale } from "@/i18n/config";
import { TAGS } from "@/lib/cache";
import { LEGAL_SEED_DATE, legalSeed } from "./seed-content";

export type LegalText = {
  content: Record<Locale, SerializedEditorState>;
  /** When the text was last saved – for the “Last updated” block. */
  updatedAt: string;
};

/** Lexical JSON with something in it – an emptied editor counts as none. */
const hasContent = (value: unknown): value is SerializedEditorState =>
  Boolean(
    (value as { root?: { children?: unknown[] } } | null | undefined)?.root
      ?.children?.length
  );

/** The code's own text in every language. */
const seeded = (): LegalText => ({
  content: Object.fromEntries(
    LOCALES.map((locale) => [locale, legalSeed(locale)])
  ) as unknown as LegalText["content"],
  updatedAt: LEGAL_SEED_DATE,
});

type Stored = {
  content: Partial<Record<Locale, SerializedEditorState>>;
  updatedAt: string | null;
};

/**
 * What the “Imprint & privacy” global holds – only that is cached (until the
 * global is saved). The code's text is added outside the cache, so a new
 * version of it shows at once.
 */
const readStored = unstable_cache(
  async (): Promise<Stored> => {
    const payload = await getPayload({ config });
    const legal = (await payload.findGlobal({
      slug: "legal",
      locale: "all",
      depth: 0,
      overrideAccess: true,
    })) as { content?: unknown; updatedAt?: string | null };
    // With locale "all" a localized field comes as { de, en }.
    const content = (legal.content ?? {}) as Partial<Record<Locale, unknown>>;
    return {
      content: Object.fromEntries(
        LOCALES.filter((locale) => hasContent(content[locale])).map(
          (locale) => [locale, content[locale]]
        )
      ) as Stored["content"],
      updatedAt: legal.updatedAt ?? null,
    };
  },
  ["legal-stored"],
  { tags: [TAGS.legal] }
);

/**
 * The legal text in both languages – a language without text in the admin
 * gets the code's (seed-content.ts), and so does everything without a
 * database (down, or the build).
 */
export const getLegal = async (): Promise<LegalText> => {
  const fallback = seeded();
  const stored = await readStored().catch(() => null);
  if (!stored) return fallback;
  return {
    content: Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        stored.content[locale] ?? fallback.content[locale],
      ])
    ) as LegalText["content"],
    updatedAt: stored.updatedAt || LEGAL_SEED_DATE,
  };
};
