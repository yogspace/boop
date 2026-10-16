import config from "@payload-config";
import { unstable_cache } from "next/cache";
import { getPayload } from "payload";
import { TAGS } from "@/lib/cache";
import { SITE_DEFAULTS, type SiteContent } from "./defaults";
import { stampColorsOf } from "./stamp-colors";
import { shapesFrom } from "./stamp-shapes";

/**
 * A group of the global, each empty or missing line filled with the code's
 * own – a global never saved has none of its fields yet.
 */
const filled = <T extends Record<string, string>>(
  defaults: T,
  stored: unknown
): T => {
  const values = (stored ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => {
      const value = values[key];
      return [
        key,
        typeof value === "string" && value.trim() ? value.trim() : fallback,
      ];
    })
  ) as T;
};

type SiteGlobal = Pick<SiteContent, "links" | "address" | "stampColors">;

/** Address, links and the stamp colors from the “Site” global (global.ts). */
const readSite = unstable_cache(
  async (): Promise<SiteGlobal> => {
    const payload = await getPayload({ config });
    // Every language at once: with locale "all" a localized field – a
    // color's name – comes as { de, en }, the others as they are.
    const site = (await payload.findGlobal({
      slug: "site",
      locale: "all",
      depth: 0,
      overrideAccess: true,
    })) as unknown as Partial<Record<keyof SiteGlobal, unknown>>;
    return {
      links: filled(SITE_DEFAULTS.links, site.links),
      address: filled(SITE_DEFAULTS.address, site.address),
      stampColors: stampColorsOf(site.stampColors),
    };
  },
  ["site"],
  { tags: [TAGS.site] }
);

/**
 * The stamp shapes and drawing templates from their collections
 * (collections.ts) – cached apart from the global, until one of them
 * changes.
 */
const readShapes = unstable_cache(
  async () => shapesFrom(await getPayload({ config })),
  ["shapes"],
  { tags: [TAGS.shapes] }
);

/** How soon a page that had to take the code's own is rendered again. */
const RETRY_SECONDS = 60;

/**
 * Marks the page being rendered as one to render again soon. A page built
 * ahead is otherwise kept as it is until the CMS changes – and the build has
 * no database: without this, every deploy would bring the code's colors
 * back until someone saves “Site” again. (Nothing is read here – only its
 * `revalidate` counts, which a page takes over from what it calls.)
 */
const retrySoon = unstable_cache(async () => null, ["site-retry"], {
  revalidate: RETRY_SECONDS,
});

/**
 * Address, links, stamp colors and shapes, drawing templates – cached until
 * they change in the CMS, the code's own without a database (down, or the
 * build). A failure is not cached, and the page showing it is rendered again
 * within a minute.
 */
export const getSite = async (): Promise<SiteContent> => {
  try {
    const [site, shapes] = await Promise.all([readSite(), readShapes()]);
    return { ...site, ...shapes };
  } catch {
    // Outside of a page (a script) there is nothing to mark.
    await retrySoon().catch(() => null);
    return SITE_DEFAULTS;
  }
};
