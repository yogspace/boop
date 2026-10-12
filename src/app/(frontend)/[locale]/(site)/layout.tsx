import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { LinkButton, Logo } from "@/components/ui";
import { getSite } from "@/features/site/get-site";
import { Link } from "@/features/transitions/link";
import { isLocale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";

/**
 * Only the languages built ahead ([locale]/layout.tsx) – any other is a 404,
 * never rendered. Set here, not on the language's frame: there it would also
 * close the app's calendar addresses, which render on demand.
 */
export const dynamicParams = false;

/** The public pages' frame: logo and the ways in on top, the footer below. */
const SiteLayout = async ({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) => {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : "de";
  const t = dictionaryOf(locale);
  const site = await getSite();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link aria-label={t.nav.home} href={`/${locale}`}>
          <Logo className="text-[32px]" />
        </Link>
        <nav className="flex items-center gap-2">
          <LinkButton href={`/${locale}/login`} size="sm" variant="ghost">
            {t.nav.login}
          </LinkButton>
          <LinkButton
            className="max-sm:hidden"
            href={`/${locale}/register`}
            size="sm"
          >
            {t.nav.register}
          </LinkButton>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <SiteFooter
        className="mt-10"
        locale={locale}
        owner={site.address.name}
        website={site.links.website}
      />
    </div>
  );
};

export default SiteLayout;
