"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Link } from "@/features/transitions/link";
import { LOCALES, type Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";

/**
 * The languages, in the bar on top of every page. Changing one keeps the
 * page: only the language at the front of the address is swapped – the rest
 * (a calendar in the app, a link's token) stays. The one in use is
 * underlined.
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
  return (
    <span
      className={cn("flex gap-2 font-medium text-muted text-sm", className)}
    >
      {LOCALES.map((other) => (
        <Link
          aria-current={other === locale ? "page" : undefined}
          className="font-black uppercase hover:text-ink aria-[current=page]:scribble-underline aria-[current=page]:text-ink aria-[current=page]:[--scribble-width:2.5px]"
          href={`/${other}${rest}${tail}`}
          hrefLang={other}
          key={other}
        >
          {other}
        </Link>
      ))}
    </span>
  );
};
