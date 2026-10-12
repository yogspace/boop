import type { ReactNode } from "react";
import { LocaleSwitch } from "@/components/locale-switch";
import { SiteFooter } from "@/components/site-footer";
import { LinkButton, Logo } from "@/components/ui";
import { AccountButton } from "@/features/accounts/account-button";
import { ONLY_SIGNED_IN, ONLY_SIGNED_OUT } from "@/features/accounts/signed-in";
import { getSite } from "@/features/site/get-site";
import { Link } from "@/features/transitions/link";
import { isLocale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

// No `dynamicParams = false`: a page whose cache tag was expired (saving
// “Site” or the legal text in the admin – lib/cache.ts) has to be rendered
// again on demand, and with it Next answers 404 instead. Another language
// than the built ones never gets here: the proxy sends it to one, and the
// language's frame ([locale]/layout.tsx) says notFound().

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
          <LocaleSwitch className="mr-1" locale={locale} />
          {/* Logged in on this device: the way into the app instead. */}
          <LinkButton
            className={ONLY_SIGNED_OUT}
            href={`/${locale}/login`}
            size="sm"
            variant="ghost"
          >
            {t.nav.login}
          </LinkButton>
          <LinkButton
            className={cn("max-sm:hidden", ONLY_SIGNED_OUT)}
            href={`/${locale}/register`}
            size="sm"
          >
            {t.nav.register}
          </LinkButton>
          {/* On a phone the bar is full – there it is in the account's menu.
              (A box of its own: “logged in” would outweigh `max-sm:hidden`.) */}
          <span className="max-sm:hidden">
            <LinkButton
              className={ONLY_SIGNED_IN}
              href={`/${locale}/app`}
              size="sm"
            >
              {t.nav.openApp}
            </LinkButton>
          </span>
          <AccountButton locale={locale} />
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
