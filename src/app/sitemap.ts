import type { MetadataRoute } from "next";
import { legalPath } from "@/features/legal/links";
import { LOCALES } from "@/i18n/config";
import { serverUrl } from "@/lib/server-url";

/** The public pages, each in both languages (hreflang alternates). */
const sitemap = (): MetadataRoute.Sitemap => {
  const site = serverUrl();
  const page = (
    path: (locale: (typeof LOCALES)[number]) => string,
    priority: number
  ) =>
    LOCALES.map((locale) => ({
      url: `${site}${path(locale)}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority,
      alternates: {
        languages: Object.fromEntries(
          LOCALES.map((other) => [other, `${site}${path(other)}`])
        ),
      },
    }));
  return [
    ...page((locale) => `/${locale}`, 1),
    ...page((locale) => `/${locale}/register`, 0.6),
    ...page(legalPath, 0.3),
  ];
};

export default sitemap;
