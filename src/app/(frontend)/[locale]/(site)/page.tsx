import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Circle, Squiggle } from "@/components/doodles";
import { LinkButton } from "@/components/ui";
import {
  DemoSticker,
  HeroScene,
  StickerRow,
} from "@/features/landing/hero-scene";
import { isLocale, LOCALES } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
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

/** The features' sticker and color – in the order of the texts. */
const FEATURES = [
  { sticker: "flower", tone: "bg-violet-soft" },
  { sticker: "heart", tone: "bg-pink-soft" },
  { sticker: "smile", tone: "bg-sky-soft" },
  { sticker: "cloud", tone: "bg-mint-soft" },
];

const STEP_COLORS = ["bg-pink", "bg-sky", "bg-mint"];

/** The front door – what Boop is, and the way in. */
const Home = async ({ params }: Props) => {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dictionaryOf(locale);
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
          <p className="rotate-[-2deg] rounded-full border-2 border-ink bg-sun px-4 py-1.5 font-black text-sm shadow-sticker-sm">
            ✦ {t.landing.kicker}
          </p>
          <h1 className="text-balance text-5xl leading-[0.95] sm:text-7xl">
            {before}
            <span className="relative inline-block whitespace-nowrap px-1 text-pink">
              {highlight}
              <Circle className="absolute -inset-x-3 -inset-y-2 h-[calc(100%+1rem)] w-[calc(100%+1.5rem)] text-ink" />
            </span>
            {after}
          </h1>
          <p className="max-w-xl text-pretty font-medium text-lg text-muted sm:text-xl">
            {t.landing.lead}
          </p>
          <div className="flex flex-wrap gap-3">
            <LinkButton href={`/${locale}/register`} size="lg">
              {t.landing.cta}
            </LinkButton>
            <LinkButton href={`/${locale}/app`} size="lg" variant="plain">
              {t.landing.ctaApp}
            </LinkButton>
          </div>
        </div>
        <HeroScene locale={locale} />
      </section>

      <section aria-labelledby="features" className="flex flex-col gap-8">
        <div>
          <h2 className="text-4xl sm:text-5xl" id="features">
            {t.landing.featuresTitle}
          </h2>
          <Squiggle className="mt-1 h-3 w-32 text-violet" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {t.landing.features.map((feature, i) => (
            <div
              className={cn(
                "group relative flex gap-4 rounded-[28px] border-2 border-ink p-6 shadow-sticker transition hover:-translate-y-1 hover:shadow-sticker-lg",
                FEATURES[i].tone
              )}
              key={feature.title}
            >
              <DemoSticker
                className="w-20 shrink-0 -rotate-6 transition group-hover:rotate-6"
                name={FEATURES[i].sticker}
              />
              <div>
                <h3 className="mb-1.5 text-2xl">{feature.title}</h3>
                <p className="font-medium text-ink/70">{feature.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="how" className="flex flex-col gap-8">
        <h2 className="text-4xl sm:text-5xl" id="how">
          {t.landing.howTitle}
        </h2>
        <ol className="grid gap-5 sm:grid-cols-3">
          {t.landing.how.map((step, i) => (
            <li
              className="flex items-start gap-4 rounded-[28px] border-2 border-ink bg-card p-5 shadow-sticker"
              key={step}
            >
              <span
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-ink font-black text-white text-xl shadow-sticker-sm",
                  STEP_COLORS[i]
                )}
              >
                {i + 1}
              </span>
              <span className="pt-2 font-bold text-lg leading-snug">
                {step}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="relative overflow-hidden rounded-[36px] border-2 border-ink bg-violet px-6 py-14 text-center text-white shadow-sticker-lg">
        <StickerRow className="mb-8" />
        <h2 className="text-balance text-4xl sm:text-5xl">
          {t.landing.closing}
        </h2>
        <LinkButton
          className="mt-8"
          href={`/${locale}/register`}
          size="lg"
          variant="plain"
        >
          {t.landing.cta}
        </LinkButton>
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
