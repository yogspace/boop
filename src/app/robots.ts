import type { MetadataRoute } from "next";
import { serverUrl } from "@/lib/server-url";

/**
 * Search engines may read the public pages (start, legal, sign-up). Not: the
 * admin, the API, the internal routes and the app itself (personal, and the
 * same empty frame for everyone without a login).
 */
const robots = (): MetadataRoute.Robots => ({
  rules: [
    {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/next/", "/de/app", "/en/app"],
    },
  ],
  sitemap: `${serverUrl()}/sitemap.xml`,
  host: serverUrl(),
});

export default robots;
