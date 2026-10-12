import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, LinkButton } from "@/components/ui";
import { isLocale, LOCALES } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { serverUrl } from "@/lib/server-url";

type Props = { params: Promise<{ locale: string }> };

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = dictionaryOf(locale);
  return {
    title: { absolute: t.meta.title },
    alternates: {
      canonical: `/${locale}`,
      languages: {
        ...Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])),
        "x-default": "/de",
      },
    },
    openGraph: {
      title: t.meta.title,
      description: t.meta.description,
      url: `/${locale}`,
    },
  };
};

/** The front door – what Boop is, and the way in. */
const Home = async ({ params }: Props) => {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dictionaryOf(locale);
  // What search engines read about the app (schema.org).
  const structured = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Boop",
    url: `${serverUrl()}/${locale}`,
    description: t.meta.description,
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Web, iOS, Android",
    inLanguage: locale,
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-16 px-4 pt-6 pb-16">
      <section className="flex flex-col items-start gap-5">
        <p className="rounded-full border-2 border-ink bg-sun px-3 py-1 font-bold text-sm">
          {t.landing.kicker}
        </p>
        <h1 className="max-w-3xl text-balance font-bold font-doodle text-5xl leading-none sm:text-7xl">
          {t.landing.title}
        </h1>
        <p className="max-w-2xl text-lg text-muted">{t.landing.lead}</p>
        <div className="flex flex-wrap gap-3">
          <LinkButton href={`/${locale}/register`}>{t.landing.cta}</LinkButton>
          <LinkButton href={`/${locale}/app`} variant="plain">
            {t.landing.ctaApp}
          </LinkButton>
        </div>
      </section>

      <section aria-labelledby="features" className="flex flex-col gap-6">
        <h2 className="font-bold font-doodle text-4xl" id="features">
          {t.landing.featuresTitle}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {t.landing.features.map((feature) => (
            <Card key={feature.title}>
              <h3 className="mb-2 font-bold text-xl">{feature.title}</h3>
              <p className="text-muted">{feature.text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="how" className="flex flex-col gap-6">
        <h2 className="font-bold font-doodle text-4xl" id="how">
          {t.landing.howTitle}
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {t.landing.how.map((step, i) => (
            <li className="flex items-start gap-3" key={step}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-mint font-bold">
                {i + 1}
              </span>
              <span className="pt-1">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col items-start gap-4">
        <h2 className="font-bold font-doodle text-4xl">{t.landing.closing}</h2>
        <LinkButton href={`/${locale}/register`}>{t.landing.cta}</LinkButton>
      </section>

      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: our own JSON, no user input
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured) }}
        type="application/ld+json"
      />
    </div>
  );
};

export default Home;
