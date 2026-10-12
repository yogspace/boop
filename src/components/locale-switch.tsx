"use client";

import { m } from "motion/react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SPRING } from "@/components/motion";
import { LOCALES, type Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";

/**
 * The languages, in the bar on top of every page. Changing one keeps the
 * page: only the language at the front of the address is swapped – the rest
 * (a calendar in the app, a link's token) stays – no page transition, the
 * page only changes its words. The one in use is underlined; the line slides
 * over to the one picked at once, before the new page is there.
 */
export const LocaleSwitch = ({
  locale,
  className,
}: {
  locale: Locale;
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
      className={cn("flex gap-2 font-medium text-muted text-sm", className)}
    >
      {LOCALES.map((other) => (
        <NextLink
          aria-current={other === locale ? "page" : undefined}
          className={cn(
            "relative font-black uppercase transition-colors hover:text-ink",
            other === picked && "text-ink"
          )}
          href={`/${other}${rest}${tail}`}
          hrefLang={other}
          key={other}
          onClick={() => setPicked(other)}
          scroll={false}
        >
          {other}
          {other === picked && (
            <m.span
              aria-hidden="true"
              className="scribble-underline pointer-events-none absolute! inset-0 [--scribble-width:2.5px]"
              layoutId="locale-underline"
              transition={SPRING.soft}
            />
          )}
        </NextLink>
      ))}
    </span>
  );
};
