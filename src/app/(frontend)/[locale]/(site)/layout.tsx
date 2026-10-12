import type { ReactNode } from "react";
import { Heart } from "@/components/doodles";
import { LinkButton, Logo } from "@/components/ui";
import { legalPath } from "@/features/legal/links";
import { Link } from "@/features/transitions/link";
import { isLocale, LOCALES } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";

/** The public pages' frame: logo, the ways in, language, legal link. */
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
      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 font-medium text-muted text-sm sm:px-6">
        <span className="flex items-center gap-1.5">
          Boop <Heart className="h-4 w-4 text-pink" />
        </span>
        <span className="flex items-center gap-4">
          <Link
            className="underline underline-offset-4"
            href={legalPath(locale)}
          >
            {t.nav.legal}
          </Link>
          {LOCALES.map((other) => (
            <Link
              aria-current={other === locale ? "page" : undefined}
              className="font-black uppercase aria-[current=page]:text-ink"
              href={`/${other}`}
              hrefLang={other}
              key={other}
            >
              {other}
            </Link>
          ))}
        </span>
      </footer>
    </div>
  );
};

export default SiteLayout;
