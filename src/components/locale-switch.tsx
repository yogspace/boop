"use client";

import { m } from "motion/react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SPRING } from "@/components/motion";
import { PILL } from "@/components/ui";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";

/**
 * The languages, in the bar on top of every page. Changing one keeps the
 * page: only the language at the front of the address is swapped – the rest
 * (a calendar in the app, a link's token) stays. The one in use is
 * underlined; the line slides over to the one picked at once.
 *
 * A page whose words come from the server is loaded anew in the other
 * language – without a page transition, but React builds everything below
 * the language again. A page that can change its words itself (the app)
 * passes `onPick`: then nothing is loaded or built anew – the address is
 * only rewritten (Next keeps its router in step with `history`), the
 * document's language set, and the page told. Where more of the address
 * is in words than the language (the app's view: /de/app/familie/heute is
 * /en/app/familie/today), the page says what it is in the other one
 * (`hrefOf`).
 *
 * `pills`: in a sheet rather than a bar (the app's account sheet) – each
 * language by its name, on a pill of its own, the one in use filled.
 */
export const LocaleSwitch = ({
  locale,
  onPick,
  hrefOf,
  pills = false,
  className,
}: {
  locale: Locale;
  /** Changes the words in place – instead of loading the page anew. */
  onPick?: (locale: Locale) => void;
  /** The page's path in another language – else only the language swaps. */
  hrefOf?: (locale: Locale) => string;
  pills?: boolean;
  className?: string;
}) => {
  const pathname = usePathname() ?? `/${locale}`;
  const rest = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "");
  // What follows the path is only known in the browser.
  const [tail, setTail] = useState("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again on every page
  useEffect(() => {
    setTail(window.location.search + window.location.hash);
  }, [pathname]);
  const [picked, setPicked] = useState(locale);
  useEffect(() => setPicked(locale), [locale]);
  return (
    <span
      className={cn(
        pills
          ? "flex flex-wrap gap-2.5"
          : "flex gap-2 font-medium text-muted text-sm",
        className
      )}
    >
      {LOCALES.map((other) => {
        const href = `${hrefOf ? hrefOf(other) : `/${other}${rest}`}${tail}`;
        return (
          <NextLink
            aria-current={other === locale ? "page" : undefined}
            className={cn(
              pills
                ? cn(PILL, "px-5 py-2.5 text-base")
                : "relative font-black uppercase transition-colors hover:text-ink",
              pills && other === picked && "scribble-ink",
              !pills && other === picked && "text-ink"
            )}
            href={href}
            hrefLang={other}
            key={other}
            onClick={(event) => {
              setPicked(other);
              // A new tab or window still gets the address itself.
              if (
                !onPick ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.button !== 0
              ) {
                return;
              }
              event.preventDefault();
              if (other === locale) return;
              window.history.replaceState(null, "", href);
              document.documentElement.lang = other;
              onPick(other);
            }}
            scroll={false}
          >
            {pills ? LOCALE_NAMES[other] : other}
            {!pills && other === picked && (
              <m.span
                aria-hidden="true"
                className="scribble-underline pointer-events-none absolute! inset-0 [--scribble-width:2.5px]"
                layoutId="locale-underline"
                transition={SPRING.soft}
              />
            )}
          </NextLink>
        );
      })}
    </span>
  );
};
