import config from "@payload-config";
import { unstable_cache } from "next/cache";
import { getPayload } from "payload";
import { TAGS } from "@/lib/cache";
import { SITE_DEFAULTS, type SiteContent } from "./defaults";

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

/** Address, email and links from the “Site” global (global.ts). */
const readSite = unstable_cache(
  async (): Promise<SiteContent> => {
    const payload = await getPayload({ config });
    const site = (await payload.findGlobal({
      slug: "site",
      depth: 0,
      overrideAccess: true,
    })) as unknown as Partial<Record<keyof SiteContent, unknown>>;
    return {
      links: filled(SITE_DEFAULTS.links, site.links),
      address: filled(SITE_DEFAULTS.address, site.address),
      contact: filled(SITE_DEFAULTS.contact, site.contact),
    };
  },
  ["site"],
  { tags: [TAGS.site] }
);

/**
 * Address, email and links – cached until the global is saved, the code's
 * own without a database (down, or the build). A failure is not cached.
 */
export const getSite = (): Promise<SiteContent> =>
  readSite().catch(() => SITE_DEFAULTS);
