import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { MotionProvider } from "@/components/motion";
import { ScribbleDefs } from "@/components/scribble-defs";
import { SIGNED_IN_SCRIPT } from "@/features/accounts/signed-in";
import { SignedInMark } from "@/features/accounts/signed-in-mark";
import { PageViewTracker } from "@/features/analytics/page-view-tracker";
import { PaletteProvider } from "@/features/calendar/palette-provider";
import { ShapesProvider } from "@/features/calendar/shapes-provider";
import { ServiceWorker } from "@/features/pwa/service-worker";
import { getSite } from "@/features/site/get-site";
import { TransitionDone } from "@/features/transitions/link";
import { getDictionary, getTexts } from "@/features/translations/get-texts";
import { TextsProvider } from "@/features/translations/texts-provider";
import { isLocale, LOCALES } from "@/i18n/config";
import { serverUrl } from "@/lib/server-url";
import "@/styles.css";

// No `dynamicParams = false` here: Next applies it to every page below, and
// a public page renders on demand after its content changed in the admin
// ((site)/layout.tsx). The app's addresses (/de/app/familie/heute) are all
// the one page of /de/app – the proxy rewrites them to it (proxy.ts) – and
// it sends anything without a language to one, too.
export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));

type Props = { params: Promise<{ locale: string }> };

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getDictionary(locale);
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
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * The frame of every page in a language: fonts, the stamp colors and
 * shapes, the texts, statistics, offline.
 */
const LocaleLayout = async ({
  children,
  params,
}: Props & { children: ReactNode }) => {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // The CMS's colors, shapes and texts, in the page itself – so they are there from
  // the first paint, and offline too (the service worker keeps the page).
  // The texts of both languages, as far as they differ from the code's: the
  // app switches its language without loading anew (get-texts.ts).
  const [{ stampColors, stampShapes, drawingTemplates }, texts] =
    await Promise.all([getSite(), getTexts()]);
  return (
    // `data-in` is set by the script below, before React – not a mismatch –
    // and kept by `SignedInMark` when this frame is built anew.
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Logged in on this device? Marked before the first paint. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant line of our own
          dangerouslySetInnerHTML={{ __html: SIGNED_IN_SCRIPT }}
        />
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
        <ScribbleDefs />
        <MotionProvider>
          <TextsProvider texts={texts}>
            <PaletteProvider colors={stampColors}>
              <ShapesProvider shapes={stampShapes} templates={drawingTemplates}>
                {children}
              </ShapesProvider>
            </PaletteProvider>
          </TextsProvider>
        </MotionProvider>
        <SignedInMark />
        <PageViewTracker />
        <TransitionDone />
        <ServiceWorker />
      </body>
    </html>
  );
};

export default LocaleLayout;
