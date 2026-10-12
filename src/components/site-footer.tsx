import { legalPath } from "@/features/legal/links";
import { Link } from "@/features/transitions/link";
import { LOCALES, type Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

/**
 * The foot of every page: the owner's website on one side; imprint and
 * privacy, the copyright and the languages on the other – on a light line,
 * no box.
 */
export const SiteFooter = ({
  locale,
  website,
  owner,
  className,
}: {
  locale: Locale;
  /** The owner's website (from the Site global). */
  website: string;
  /** Who holds the copyright. */
  owner: string;
  className?: string;
}) => {
  const t = dictionaryOf(locale);
  const host = website.replace(/^https?:\/\//, "").replace(/[/?].*$/, "");
  return (
    <footer
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-3 border-line border-t-2 px-4 pt-4 pb-6 font-medium text-muted text-sm sm:px-6",
        className
      )}
    >
      <a
        className="inline-flex items-center gap-1 font-bold text-ink underline-offset-4 hover:underline"
        href={website}
        rel="noopener"
        target="_blank"
      >
        {host}
        <span aria-hidden="true">↗</span>
      </a>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          className="underline-offset-4 hover:underline"
          href={legalPath(locale)}
        >
          {t.nav.legal}
        </Link>
        <span aria-hidden="true">·</span>
        <span>
          © {new Date().getFullYear()} {owner}
        </span>
        <span aria-hidden="true">·</span>
        <span className="flex gap-2">
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
      </span>
    </footer>
  );
};
