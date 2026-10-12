import Link from "next/link";
import type { ReactNode } from "react";
import { LinkButton } from "@/components/ui";
import { legalPath } from "@/features/legal/links";
import { isLocale, LOCALES } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";

/** The public pages' frame: logo, login, language, legal link. */
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
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-5">
        <Link
          aria-label={t.nav.home}
          className="font-doodle font-bold text-3xl"
          href={`/${locale}`}
        >
          boop<span className="text-coral">.</span>
        </Link>
        <nav className="flex items-center gap-2">
          <LinkButton
            className="px-4 py-2 text-sm"
            href={`/${locale}/login`}
            variant="plain"
          >
            {t.nav.login}
          </LinkButton>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-muted text-sm">
        <Link className="underline underline-offset-4" href={legalPath(locale)}>
          {t.nav.legal}
        </Link>
        <span className="flex gap-3">
          {LOCALES.map((other) => (
            <Link
              aria-current={other === locale ? "page" : undefined}
              className="font-bold uppercase aria-[current=page]:text-ink"
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
