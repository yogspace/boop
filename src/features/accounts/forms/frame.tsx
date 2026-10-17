"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import { Star, Ticks } from "@/components/doodles";
import { demoStamp } from "@/features/stickers/demo";
import { Sticker } from "@/features/stickers/sticker";
import { Link } from "@/features/transitions/link";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";

/**
 * What every account page's form stands on: its sheet with a sticker on
 * the corner, its links, and sending it.
 */

export const Frame = ({
  title,
  sticker = "heart",
  children,
}: {
  title: string;
  sticker?: string;
  children: ReactNode;
}) => (
  <div className="mx-auto w-full max-w-md px-4 pt-12 pb-16">
    {/* A scribbled sheet; the sticker on its corner is the only color. */}
    <div className="scribble rounded-[32px] p-6 sm:p-8">
      <div
        className="absolute -top-10 -right-1 w-24 animate-float sm:-right-4"
        style={{ "--tilt": "10deg" } as React.CSSProperties}
      >
        <Sticker stamp={demoStamp(sticker)} />
      </div>
      <Ticks className="absolute -top-8 right-[4.75rem] h-5 w-8 -rotate-[38deg] sm:right-[5.5rem]" />
      <Star className="absolute -top-3.5 left-8 h-7 w-7 -rotate-12" />
      <h1 className="mb-6 pr-16 text-4xl">{title}</h1>
      <div className="flex flex-col gap-5">{children}</div>
    </div>
  </div>
);

/** Shared form state: busy, error, and a guard against being offline. */
export const useSubmit = (locale: Locale) => {
  const t = dictionaryOf(locale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run =
    (work: () => Promise<string | null>) => async (event: FormEvent) => {
      event.preventDefault();
      if (!navigator.onLine) {
        setError(t.auth.offline);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        setError(await work());
      } catch {
        setError(t.auth.failed);
      } finally {
        setBusy(false);
      }
    };
  return { busy, error, run };
};

export const TextLink = (props: React.ComponentProps<typeof Link>) => (
  <Link
    className="font-bold text-ink underline decoration-2 underline-offset-4 hover:decoration-[3px]"
    {...props}
  />
);
