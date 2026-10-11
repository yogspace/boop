import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLegal } from "@/features/legal/get-legal";
import { LegalContent } from "@/features/legal/legal-content";
import {
  LEGAL_DESCRIPTION,
  LEGAL_TITLE,
  legalPath,
} from "@/features/legal/links";
import { getSite } from "@/features/site/get-site";
import { isLocale, LOCALES } from "@/i18n/config";

// Rendered per request: the text, address and email come from the admin
// (cached until saved, see lib/cache.ts) – and the build has no database.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: LEGAL_TITLE[locale],
    description: LEGAL_DESCRIPTION[locale],
    alternates: {
      canonical: legalPath(locale),
      languages: Object.fromEntries(
        LOCALES.map((other) => [other, legalPath(other)])
      ),
    },
  };
};

/**
 * The text from the CMS has no classes of its own – its headings,
 * paragraphs, lists and links are styled from here. Colors follow the page
 * (currentColor), so the layout's theme applies.
 */
const PROSE = [
  "[&_h2]:mt-14 [&_h2]:mb-4 [&_h2]:font-bold [&_h2]:text-2xl [&_h2]:leading-tight [&_h2]:tracking-tight [&_h2]:text-balance [&_h2:first-child]:mt-0",
  "[&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:font-bold [&_h3]:text-lg [&_h3]:leading-snug [&_h3]:text-balance",
  "[&_:is(p,address)]:mb-3 [&_:is(p,address)]:leading-relaxed [&_:is(p,address)]:text-current/75 [&_address]:not-italic [&_p]:text-pretty [&_p]:hyphens-auto",
  "[&_:is(ul,ol)]:my-3 [&_:is(ul,ol)]:pl-6 [&_li]:mb-1 [&_ol]:list-decimal [&_ul]:list-disc",
  "[&_a]:font-medium [&_a]:underline [&_a]:decoration-current/30 [&_a]:underline-offset-3 [&_a]:wrap-break-word [&_a:hover]:decoration-current",
].join(" ");

/** Imprint and privacy policy: /de/legal and /en/legal. */
const LegalPage = async ({ params }: Props) => {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [legal, site] = await Promise.all([getLegal(), getSite()]);

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="mb-10 text-balance font-bold text-3xl leading-tight tracking-tight sm:text-4xl">
        {LEGAL_TITLE[locale]}
      </h1>
      <div className={PROSE}>
        <LegalContent
          data={legal.content[locale]}
          locale={locale}
          site={site}
          updatedAt={legal.updatedAt}
        />
      </div>
    </article>
  );
};

export default LegalPage;
