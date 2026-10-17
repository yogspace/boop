"use client";

import { Ticks } from "@/components/doodles";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { shelfAddressOf } from "../address";
import { StampPile, type useShelf } from "../stamp-shelf";

/**
 * The greeting over the calendars – and right beside it, up top, the way to
 * the shelf: a little pile of the stamps last used. A long name wraps; the
 * pile stays where it is. Kept small – the calendar under it is what the
 * page is for.
 */
export const Greeting = ({
  locale,
  name,
  shelf,
  onShelf,
}: {
  locale: Locale;
  /** The account's first name. */
  name: string;
  shelf: ReturnType<typeof useShelf>;
  onShelf: () => void;
}) => {
  const t = dictionaryOf(locale);
  return (
    <section className="-mt-2 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="wrap-break-word text-[1.75rem] leading-tight sm:text-4xl">
          {t.app.hello(name)}
          <Ticks className="ml-1 inline h-[0.5em] w-[0.8em] -translate-y-[0.5em] rotate-[24deg]" />
        </h1>
        <p className="mt-0.5 font-medium text-muted text-sm sm:text-base">
          {t.app.lead}
        </p>
      </div>
      <StampPile
        count={shelf.count}
        href={shelfAddressOf(locale)}
        locale={locale}
        onOpen={onShelf}
        stamps={shelf.latest}
      />
    </section>
  );
};
