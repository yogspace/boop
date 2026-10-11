import type { Payload } from "payload";
import { LOCALES, type Locale } from "@/i18n/config";
import { legalSeed } from "./seed-content";

export type SeedMode = "fill" | "replace";
export type SeedResult = "set" | "kept";

/**
 * The imprint and privacy policy as the code writes them – per language:
 * filled while that language has none, or set back (“replace”). Until then
 * the page shows the code's version anyway (get-legal.ts).
 */
export const seedLegal = async (
  payload: Payload,
  mode: SeedMode
): Promise<Record<Locale, SeedResult>> => {
  const results = {} as Record<Locale, SeedResult>;
  for (const locale of LOCALES) {
    const doc = (await payload.findGlobal({
      slug: "legal",
      locale,
      fallbackLocale: false,
      depth: 0,
      overrideAccess: true,
    })) as { content?: { root?: { children?: unknown[] } } | null };
    if (mode === "fill" && doc.content?.root?.children?.length) {
      results[locale] = "kept";
      continue;
    }
    await payload.updateGlobal({
      slug: "legal",
      locale,
      data: { content: legalSeed(locale) as never },
      overrideAccess: true,
    });
    results[locale] = "set";
  }
  return results;
};
