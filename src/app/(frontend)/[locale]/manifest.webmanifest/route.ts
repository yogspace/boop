import { isLocale, LOCALES } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";

/**
 * The web app manifest per language (/de/manifest.webmanifest): what the
 * installed app is called, where it starts, its icons. Linked from the
 * layout's metadata.
 */
export const dynamic = "force-static";

export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ locale: string }> }
) => {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : "de";
  const t = dictionaryOf(locale);
  return Response.json(
    {
      id: "/",
      name: "Boop",
      short_name: "Boop",
      description: t.meta.description,
      lang: locale,
      start_url: `/${locale}/app`,
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#ffffff",
      theme_color: "#ffffff",
      categories: ["lifestyle", "productivity"],
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        {
          src: "/icons/maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
};
