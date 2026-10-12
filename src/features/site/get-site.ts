import config from "@payload-config";
import { unstable_cache } from "next/cache";
import { getPayload } from "payload";
import {
  cleanPalette,
  DEFAULT_PALETTE,
  type StampColor,
} from "@/features/calendar/palette";
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

/**
 * The stamp colors' rows, checked (palette.ts): a row without a proper key
 * or hex is left out, a name missing in a language filled in – and with no
 * row left, the code's own colors.
 */
const stampColors = (stored: unknown): StampColor[] => {
  const rows = (Array.isArray(stored) ? stored : []) as unknown[];
  const colors = cleanPalette(
    rows.map((row) => {
      const { key, color, name } = (row ?? {}) as Record<string, unknown>;
      return { key, hex: color, name };
    })
  );
  return colors.length ? colors : DEFAULT_PALETTE;
};

/** Address, links and stamp colors from the “Site” global (global.ts). */
const readSite = unstable_cache(
  async (): Promise<SiteContent> => {
    const payload = await getPayload({ config });
    // Every language at once: with locale "all" a localized field – a
    // color's name – comes as { de, en }, the others as they are.
    const site = (await payload.findGlobal({
      slug: "site",
      locale: "all",
      depth: 0,
      overrideAccess: true,
    })) as unknown as Partial<Record<keyof SiteContent, unknown>>;
    return {
      links: filled(SITE_DEFAULTS.links, site.links),
      address: filled(SITE_DEFAULTS.address, site.address),
      stampColors: stampColors(site.stampColors),
    };
  },
  ["site"],
  { tags: [TAGS.site] }
);

/** How soon a page that had to take the code's own is rendered again. */
const RETRY_SECONDS = 60;

/**
 * Marks the page being rendered as one to render again soon. A page built
 * ahead is otherwise kept as it is until the global is saved – and the build
 * has no database: without this, every deploy would bring the code's colors
 * back until someone saves “Site” again. (Nothing is read here – only its
 * `revalidate` counts, which a page takes over from what it calls.)
 */
const retrySoon = unstable_cache(async () => null, ["site-retry"], {
  revalidate: RETRY_SECONDS,
});

/**
 * Address, links and stamp colors – cached until the global is saved, the
 * code's own without a database (down, or the build). A failure is not
 * cached, and the page showing it is rendered again within a minute.
 */
export const getSite = (): Promise<SiteContent> =>
  readSite().catch(async () => {
    // Outside of a page (a script) there is nothing to mark.
    await retrySoon().catch(() => null);
    return SITE_DEFAULTS;
  });
