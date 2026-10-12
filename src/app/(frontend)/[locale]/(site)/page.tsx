import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Circle, Star, Ticks, Underline } from "@/components/doodles";
import { LinkButton } from "@/components/ui";
import { ONLY_SIGNED_IN, ONLY_SIGNED_OUT } from "@/features/accounts/signed-in";
import {
  DemoSticker,
  HeroScene,
  StickerRow,
} from "@/features/landing/hero-scene";
import { Steps } from "@/features/landing/steps";
import { getDictionary } from "@/features/translations/get-texts";
import { isLocale, LOCALES } from "@/i18n/config";
import { serverUrl } from "@/lib/server-url";

type Props = { params: Promise<{ locale: string }> };

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getDictionary(locale);
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

/** The features' stickers – in the order of the texts. */
const FEATURES = ["flower", "heart", "smile", "cloud"];

/**
 * The front door – what Boop is, and the way in. Marker on paper: the frames,
 * the circle round the word, the numbers are scribbled; the stickers are the
 * only color.
 */
const Home = async ({ params }: Props) => {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getDictionary(locale);
  const [before, highlight, after] = t.landing.title;
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
    <div className="mx-auto flex max-w-6xl flex-col gap-24 px-4 pt-4 pb-20 sm:px-6">
      <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col items-start gap-6">
          <p className="scribble inline-flex -rotate-2 items-center gap-1.5 rounded-full px-4 py-1.5 font-black text-sm">
            <Star className="h-4 w-4" />
            {t.landing.kicker}
          </p>
          <h1 className="text-balance text-5xl leading-[0.95] sm:text-7xl">
            {before}
            <span className="relative mr-[0.14em] inline-block whitespace-nowrap">
              {highlight}
              {/* The one line on the page that keeps boiling – slowly. */}
              <Circle className="boil pointer-events-none absolute -top-[0.14em] -left-[0.24em] h-[calc(100%+0.38em)] w-[calc(100%+0.46em)] [--boil:960ms] [stroke-width:3.5px] sm:[stroke-width:4.5px]" />
            </span>
            {after}
          </h1>
          <p className="max-w-xl text-pretty font-medium text-lg text-muted sm:text-xl">
            {t.landing.lead}
          </p>
          <div className="flex flex-wrap gap-3">
            {/* Logged in on this device: straight into the app. */}
            <LinkButton
              className={ONLY_SIGNED_OUT}
              href={`/${locale}/register`}
              size="lg"
            >
              {t.landing.cta}
            </LinkButton>
            <LinkButton
              className={ONLY_SIGNED_OUT}
              href={`/${locale}/app`}
              size="lg"
              variant="plain"
            >
              {t.landing.ctaApp}
            </LinkButton>
            <LinkButton
              className={ONLY_SIGNED_IN}
              href={`/${locale}/app`}
              size="lg"
            >
              {t.nav.openApp}
            </LinkButton>
          </div>
        </div>
        <HeroScene locale={locale} />
      </section>

      <section aria-labelledby="features" className="flex flex-col gap-8">
        <div className="self-start">
          <h2 className="text-4xl sm:text-5xl" id="features">
            {t.landing.featuresTitle}
          </h2>
          <Underline className="mt-1 h-3.5 w-full" />
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {t.landing.features.map((feature, i) => (
            <div
              className="scribble group flex gap-4 rounded-[28px] p-6 transition-transform duration-200 ease-out hover:-translate-y-1 hover:scribble-boil"
              key={feature.title}
            >
              <DemoSticker
                className="w-20 shrink-0 -rotate-6 transition-transform duration-300 group-hover:rotate-6"
                name={FEATURES[i]}
              />
              <div>
                <h3 className="mb-1.5 text-2xl">{feature.title}</h3>
                <p className="font-medium text-muted">{feature.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="how" className="flex flex-col gap-8">
        <div className="self-start">
          <h2 className="text-4xl sm:text-5xl" id="how">
            {t.landing.howTitle}
          </h2>
          <Underline className="mt-1 h-3.5 w-full" />
        </div>
        {/* A little picture story, each step on its own slip (steps.tsx). */}
        <Steps steps={t.landing.how} />
      </section>

      {/* A `group`: wherever the pointer is in the box, the stamps above
          look at it (stickers/look.ts) – and at you, when the button has
          the focus. */}
      <section className="group scribble scribble-bold rounded-[36px] px-6 py-14 text-center">
        <StickerRow className="mb-8" />
        <h2 className="text-balance text-4xl sm:text-5xl">
          {t.landing.closing}
        </h2>
        <span className="relative mt-8 inline-block">
          <Ticks className="absolute -top-6 -right-7 h-6 w-10 rotate-[32deg]" />
          <LinkButton
            className={ONLY_SIGNED_OUT}
            href={`/${locale}/register`}
            size="lg"
          >
            {t.landing.cta}
          </LinkButton>
          <LinkButton
            className={ONLY_SIGNED_IN}
            href={`/${locale}/app`}
            size="lg"
          >
            {t.nav.openApp}
          </LinkButton>
        </span>
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
