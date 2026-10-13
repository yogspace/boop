import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardPanel } from "@/features/cards/ui/card-panel";
import { getDictionary } from "@/features/translations/get-texts";
import { isLocale } from "@/i18n/config";
import { readCard } from "./read";

// Asked at every visit: a card can go any time (its stamp deleted, its
// giver's account), and the page is built without a database. The page is
// the same for everyone – who looks at it the browser knows
// (features/cards/ui/card-panel.tsx).
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; id: string }> };

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const t = await getDictionary(locale);
  const card = await readCard(id);
  // What a messenger shows of the link: “Anna is sending you a stamp” – the
  // picture is this folder's opengraph-image.
  const title = card
    ? t.card.title(card.from.split(" ")[0] ?? "")
    : card === null
      ? t.card.goneTitle
      : t.card.title("");
  return {
    title,
    description: t.card.description,
    // All of it: a page's `openGraph` takes the place of the frame's.
    openGraph: {
      type: "website",
      siteName: "Boop",
      locale: locale === "de" ? "de_DE" : "en_US",
      title,
      description: t.card.description,
    },
    // A card is for whoever has its link – never for a search.
    robots: { index: false, follow: false },
  };
};

const Page = async ({ params }: Props) => {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  return <CardPanel card={await readCard(id)} id={id} locale={locale} />;
};

export default Page;
