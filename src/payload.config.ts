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
import { Notes } from "@/features/calendar/collections/notes";
import { Placements } from "@/features/calendar/collections/placements";
import { Stamps } from "@/features/calendar/collections/stamps";
import { Invites } from "@/features/calendar/invites";
import { CalendarFeeds } from "@/features/ical/collection";
import { icalEndpoints } from "@/features/ical/endpoints";
import { Legal } from "@/features/legal/global";
import { PushSettings, PushSubscriptions } from "@/features/push/collections";
import { pushEndpoints } from "@/features/push/endpoints";
import { Site } from "@/features/site/global";
import { syncEndpoint } from "@/features/sync/endpoint";
import { liveEndpoint } from "@/features/sync/live";
import { Translations } from "@/features/translations/global";
import { LOCALES } from "@/i18n/config";
import { devMailAdapter } from "@/lib/dev-mail";
import { mailSender } from "@/lib/mail";
import { serverUrl } from "@/lib/server-url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Boop's backend. Each feature brings its collections, globals and endpoints
 * (src/features/*) – this file only puts them together:
 *
 * - admin      the CMS logins and the Seeds page
 * - accounts   the people using Boop (email + password, mails)
 * - calendar   calendars, stamps, placements, notes – written through
 * - sync       the one endpoint the app reads and writes with, also after
 *              being offline
 * - push       notifications: the devices that said yes, their settings
 * - ical       a calendar for calendar apps: private feed addresses, the
 *              feed itself, the export as a file
 * - analytics  anonymous statistics and the mail report
 * - site/legal settings, imprint and privacy
 * - translations the texts of the site and the app, editable – the code
 *              brings them along (i18n/dictionaries.ts)
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
      // Boop's word mark over the login, its “b” on top of every page.
      graphics: {
        Logo: "@/features/admin/graphics#AdminLogo",
        Icon: "@/features/admin/graphics#AdminIcon",
      },
      // Support mode on (ADMIN_SUPPORT, src/access): said on every page.
      header: ["@/features/admin/support-banner#SupportBanner"],
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
    PushSubscriptions,
    PushSettings,
    Calendars,
    Stamps,
    Placements,
    Notes,
    Invites,
    CalendarFeeds,
    PageViews,
    Actions,
  ],
  // Analytics last – its own group, at the very bottom.
  globals: [Site, Legal, Translations, Analytics],
  endpoints: [
    syncEndpoint,
    liveEndpoint,
    ...pushEndpoints,
    ...icalEndpoints,
    seedEndpoint,
  ],
  // The admin's login cookie, `boop-token` – the app has its own
  // (features/accounts/session.ts). Only sent along from our own pages.
  cookiePrefix: "boop",
  csrf: [serverUrl()],
  // The app speaks REST (and the sync) only – and GraphQL would be one more
  // way in to keep closed (src/access).
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
  // Without a Resend key (locally) the mails' links go to the server log.
  email: process.env.RESEND_API_KEY
    ? resendAdapter({
        apiKey: process.env.RESEND_API_KEY,
        defaultFromAddress: sender.address,
        defaultFromName: sender.name,
      })
    : devMailAdapter(),
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
