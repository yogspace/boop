import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BoopApp } from "@/features/app/boop-app";
import { isLocale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";

type Props = { params: Promise<{ locale: string }> };

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: dictionaryOf(locale).nav.openApp,
    robots: { index: false, follow: false },
  };
};

/**
 * The app – one static page per language, the same for everyone and every
 * calendar: the data comes from the device (offline/store.ts), so the
 * service worker can keep this page and open it without a connection.
 *
 * Every address below it – a calendar and its view, /de/app/familie/heute
 * (features/app/address.ts) – is this very page: the proxy hands it over
 * (src/proxy.ts), and the browser reads the rest (BoopApp), never the
 * server. So the server keeps one page per language, not one per address.
 */
const AppPage = async ({ params }: Props) => {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <BoopApp locale={locale} />;
};

export default AppPage;
