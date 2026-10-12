import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BoopApp } from "@/features/app/boop-app";
import { isLocale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";

type Props = { params: Promise<{ locale: string; calendar?: string[] }> };

/**
 * Built ahead: the bare /de/app. A calendar's address (/de/app/{id}) is the
 * same page – it renders on its first visit.
 */
export const generateStaticParams = () => [{ calendar: [] }];

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
 * service worker can keep this page and open it without a connection. The
 * calendar in the address is read in the browser (BoopApp), never here.
 */
const AppPage = async ({ params }: Props) => {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <BoopApp locale={locale} />;
};

export default AppPage;
