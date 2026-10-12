import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ForgotForm } from "@/features/accounts/forms";
import { getDictionary } from "@/features/translations/get-texts";
import { isLocale } from "@/i18n/config";

type Props = { params: Promise<{ locale: string }> };

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getDictionary(locale);
  // Account pages stay out of search results.
  return { title: t.auth.forgot.title, robots: { index: false, follow: true } };
};

const Page = async ({ params }: Props) => {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <Suspense>
      <ForgotForm locale={locale} />
    </Suspense>
  );
};

export default Page;
