import { legalPath } from "@/features/legal/links";
import { Link } from "@/features/transitions/link";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

/**
 * The foot of every page: the owner's website on one side; imprint and
 * privacy and the copyright on the other – under a ruled marker line, no
 * box. (The languages are in the bar on top: locale-switch.tsx.)
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
        "mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 pb-6 font-medium text-muted text-sm sm:px-6",
        className
      )}
    >
      <span aria-hidden="true" className="scribble-rule w-full text-ink" />
      <a
        className="inline-flex items-center gap-1 font-bold text-ink decoration-2 underline-offset-4 hover:underline"
        href={website}
        rel="noopener"
        target="_blank"
      >
        {host}
        <span aria-hidden="true">↗</span>
      </a>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          className="decoration-2 underline-offset-4 hover:text-ink hover:underline"
          href={legalPath(locale)}
        >
          {t.nav.legal}
        </Link>
        <span aria-hidden="true">·</span>
        <span>
          © {new Date().getFullYear()} {owner}
        </span>
      </span>
    </footer>
  );
};
