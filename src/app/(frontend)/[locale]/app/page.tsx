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
 * The app – one static page per language, the same for everyone: the data
 * comes from the device (offline/store.ts), so the service worker can keep
 * this page and open it without a connection.
 */
const AppPage = async ({ params }: Props) => {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <BoopApp locale={locale} />;
};

export default AppPage;
