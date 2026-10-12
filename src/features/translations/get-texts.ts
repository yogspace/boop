import config from "@payload-config";
import { unstable_cache } from "next/cache";
import { getPayload } from "payload";
import type { Locale } from "@/i18n/config";
import {
  type Dictionary,
  dictionaryOf,
  setTexts,
  type Texts,
  usableTexts,
} from "@/i18n/dictionaries";
import { TAGS } from "@/lib/cache";
import { TRANSLATION_KEYS } from "./defaults";
import { storedTexts } from "./tree";

/**
 * What the Translations global holds, flat, in both languages – cached
 * until it is saved. Throws without a database (a failure is not cached).
 */
const readStored = unstable_cache(
  async () => {
    const payload = await getPayload({ config });
    // Every language at once: with locale "all" each text comes as
    // { de, en } – and without falling back to the other language.
    const doc = await payload.findGlobal({
      slug: "translations",
      locale: "all",
      depth: 0,
      overrideAccess: true,
    });
    return storedTexts(doc, TRANSLATION_KEYS);
  },
  ["translations"],
  { tags: [TAGS.texts] }
);

/** How soon a page that had to take the code's texts is rendered again. */
const RETRY_SECONDS = 60;

/**
 * Marks the page being rendered as one to render again soon – the build
 * has no database, and a page built ahead (the app's) would otherwise keep
 * the code's texts until someone saves the global. As `getSite` does.
 */
const retrySoon = unstable_cache(async () => null, ["texts-retry"], {
  revalidate: RETRY_SECONDS,
});

/**
 * The CMS's texts a page needs: of both languages those that fit and say
 * something else than the code (i18n/dictionaries.ts) – the code's are in
 * the page anyway. Without a database (down, or the build): none, so the
 * code's show. Checked after the cache, so a key changed in the code counts
 * at once. For `TextsProvider` (the layout) – both languages, as the app
 * switches without loading anew.
 */
export const getTexts = async (): Promise<Texts> => {
  const stored = await readStored().catch(async () => {
    // Outside of a page (a script) there is nothing to mark.
    await retrySoon().catch(() => null);
    return null;
  });
  return usableTexts(stored);
};

/**
 * A language's texts on the server – a server component, a layout,
 * `generateMetadata`, a route, a notification: the CMS's where it has
 * them. Also puts them in use for what calls `dictionaryOf` on the server
 * afterwards (components/site-footer.tsx under the site's frame).
 */
export const getDictionary = async (locale: Locale): Promise<Dictionary> => {
  setTexts(await getTexts());
  return dictionaryOf(locale);
};
