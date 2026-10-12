import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageViewTracker } from "@/features/analytics/page-view-tracker";
import { PaletteProvider } from "@/features/calendar/palette-provider";
import { ServiceWorker } from "@/features/pwa/service-worker";
import { getSite } from "@/features/site/get-site";
import { TransitionDone } from "@/features/transitions/link";
import { isLocale, LOCALES } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { serverUrl } from "@/lib/server-url";
import "@/styles.css";

// No `dynamicParams = false` here: Next applies it to every page below, and
// the app's calendar addresses (/de/app/{id}) render on demand. The public
// pages set it ((site)/layout.tsx); the proxy sends anything without a
// language to one anyway.
export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));

type Props = { params: Promise<{ locale: string }> };

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = dictionaryOf(locale);
  return {
    metadataBase: new URL(serverUrl()),
    title: { default: t.meta.title, template: `%s · ${t.meta.short}` },
    description: t.meta.description,
    keywords: t.meta.keywords,
    applicationName: "Boop",
    manifest: `/${locale}/manifest.webmanifest`,
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
      apple: "/icons/apple-touch-icon.png",
    },
    appleWebApp: { capable: true, title: "Boop", statusBarStyle: "default" },
    openGraph: {
      type: "website",
      siteName: "Boop",
      locale: locale === "de" ? "de_DE" : "en_US",
    },
    twitter: { card: "summary_large_image" },
    ...(process.env.GOOGLE_SITE_VERIFICATION && {
      verification: { google: process.env.GOOGLE_SITE_VERIFICATION },
    }),
  };
};

export const viewport: Viewport = {
  themeColor: "#f5f2ff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * The frame of every page in a language: fonts, the stamp colors, statistics,
 * offline.
 */
const LocaleLayout = async ({
  children,
  params,
}: Props & { children: ReactNode }) => {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // The CMS's colors, in the page itself – so they are there from the first
  // paint, and offline too (the service worker keeps the page).
  const { stampColors } = await getSite();
  return (
    <html lang={locale}>
      <head>
        {/* The one font, self-hosted (styles.css) – early, so text doesn't jump. */}
        <link
          as="font"
          crossOrigin=""
          href="/fonts/Satoshi-Variable.woff2"
          rel="preload"
          type="font/woff2"
        />
      </head>
      <body>
        <PaletteProvider colors={stampColors}>{children}</PaletteProvider>
        <PageViewTracker />
        <TransitionDone />
        <ServiceWorker />
      </body>
    </html>
  );
};

export default LocaleLayout;
