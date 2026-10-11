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

/**
 * The legal text in both languages from the “Imprint & privacy” global – a
 * language without text gets the code's (seed-content.ts).
 */
const readLegal = unstable_cache(
  async (): Promise<LegalText> => {
    const payload = await getPayload({ config });
    const legal = (await payload.findGlobal({
      slug: "legal",
      locale: "all",
      depth: 0,
      overrideAccess: true,
    })) as { content?: unknown; updatedAt?: string | null };
    // With locale "all" a localized field comes as { de, en }.
    const content = (legal.content ?? {}) as Partial<Record<Locale, unknown>>;
    const fallback = seeded();
    return {
      content: Object.fromEntries(
        LOCALES.map((locale) => {
          const stored = content[locale];
          return [
            locale,
            hasContent(stored) ? stored : fallback.content[locale],
          ];
        })
      ) as LegalText["content"],
      updatedAt: legal.updatedAt || LEGAL_SEED_DATE,
    };
  },
  ["legal"],
  { tags: [TAGS.legal] }
);

/**
 * The legal text – cached until the global is saved, the code's own without
 * a database (down, or the build). A failure is not cached.
 */
export const getLegal = (): Promise<LegalText> => readLegal().catch(seeded);
