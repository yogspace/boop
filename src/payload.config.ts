import path from "node:path";
import { fileURLToPath } from "node:url";
import { mongooseAdapter } from "@payloadcms/db-mongodb";
import { resendAdapter } from "@payloadcms/email-resend";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { de } from "@payloadcms/translations/languages/de";
import { en } from "@payloadcms/translations/languages/en";
import { buildConfig } from "payload";
import sharp from "sharp";
import { Accounts } from "@/features/accounts/collection";
import { seedAdmin } from "@/features/admin/seed-admin";
import { SEEDS_PATH } from "@/features/admin/seeds/definitions";
import { seedEndpoint } from "@/features/admin/seeds/endpoint";
import { Users } from "@/features/admin/users";
import { Actions } from "@/features/analytics/collections/actions";
import { PageViews } from "@/features/analytics/collections/page-views";
import { Analytics } from "@/features/analytics/global";
import { Calendars } from "@/features/calendar/collections/calendars";
import { Placements } from "@/features/calendar/collections/placements";
import { Stamps } from "@/features/calendar/collections/stamps";
import { Legal } from "@/features/legal/global";
import { Site } from "@/features/site/global";
import { syncEndpoint } from "@/features/sync/endpoint";
import { LOCALES } from "@/i18n/config";
import { mailSender } from "@/lib/mail";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Boop's backend. Each feature brings its collections, globals and endpoints
 * (src/features/*) – this file only puts them together:
 *
 * - admin      the CMS logins and the Seeds page
 * - accounts   the people using Boop (email + password, mails)
 * - calendar   calendars, stamps, placements – written through
 * - sync       the one endpoint the app reads and writes with, also after
 *              being offline
 * - analytics  anonymous statistics and the mail report
 * - site/legal settings, imprint and privacy
 *
 * Everything that differs between machines comes from the environment (see
 * .env.example).
 */

const sender = mailSender();

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: dirname },
    meta: {
      titleSuffix: " · Boop",
      icons: [{ rel: "icon", type: "image/svg+xml", url: "/icon.svg" }],
    },
    components: {
      afterNavLinks: ["@/features/admin/seeds/seeds-nav-link#SeedsNavLink"],
      views: {
        seeds: {
          Component: "@/features/admin/seeds/seeds-view#SeedsView",
          path: SEEDS_PATH,
          meta: { title: "Seeds" },
        },
      },
    },
    timezones: {
      supportedTimezones: [
        { label: "Deutschland / Berlin", value: "Europe/Berlin" },
      ],
      defaultTimezone: "Europe/Berlin",
    },
  },
  i18n: {
    supportedLanguages: { de, en },
    fallbackLanguage: "de",
  },
  // The admin's groups follow this order.
  collections: [
    Users,
    Accounts,
    Calendars,
    Stamps,
    Placements,
    PageViews,
    Actions,
  ],
  globals: [Site, Legal, Analytics],
  endpoints: [syncEndpoint, seedEndpoint],
  // Both logins (admin and accounts) in one cookie, `boop-token`.
  cookiePrefix: "boop",
  // The app speaks REST (and the sync) only.
  graphQL: { disable: true },
  editor: lexicalEditor(),
  localization: {
    locales: LOCALES.map((code) => ({
      code,
      label: code === "de" ? "Deutsch" : "English",
    })),
    defaultLocale: "de",
    fallback: true,
  },
  // Without a Resend key, Payload writes the mails to the console – enough
  // to click the links locally.
  ...(process.env.RESEND_API_KEY && {
    email: resendAdapter({
      apiKey: process.env.RESEND_API_KEY,
      defaultFromAddress: sender.address,
      defaultFromName: sender.name,
    }),
  }),
  db: mongooseAdapter({
    url: process.env.DATABASE_URL ?? "",
    connectOptions: {
      serverSelectionTimeoutMS: 5000,
      // Close idle sockets before the Docker network quietly drops them –
      // otherwise the next query after a pause takes a dead one (ECONNRESET).
      maxIdleTimeMS: 10_000,
      retryReads: true,
      retryWrites: true,
    },
  }),
  secret: process.env.PAYLOAD_SECRET ?? "",
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  // At start only the first admin (from the environment) – content seeds run
  // from the admin's Seeds page. Errors must not stop the start.
  onInit: async (payload) => {
    try {
      await seedAdmin(payload);
    } catch (error) {
      payload.logger.warn(
        `Admin seeding skipped: ${error instanceof Error ? error.message : error}`
      );
    }
  },
});
