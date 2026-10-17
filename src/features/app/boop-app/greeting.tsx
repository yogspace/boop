"use client";

import { Ticks } from "@/components/doodles";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { shelfAddressOf } from "../address";
import { StampPile, type useShelf } from "../stamp-shelf";

/**
 * The greeting over the calendars – and right beside it, up top, the way to
 * the shelf: a little pile of the stamps last used. A long name wraps; the
 * pile stays where it is.
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
        <h1 className="wrap-break-word text-4xl sm:text-5xl">
          {t.app.hello(name)}
          <Ticks className="ml-1 inline h-[0.5em] w-[0.8em] -translate-y-[0.5em] rotate-[24deg]" />
        </h1>
        <p className="mt-1 font-medium text-muted">{t.app.lead}</p>
      </div>
      <StampPile
        count={shelf.stamps.length}
        href={shelfAddressOf(locale)}
        locale={locale}
        onOpen={onShelf}
        stamps={shelf.latest}
      />
    </section>
  );
};
