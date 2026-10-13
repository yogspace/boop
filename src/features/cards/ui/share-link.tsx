"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check } from "@/components/doodles";
import { Button, FIELD_BOX, FIELD_INPUT } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

/** Whether the device has a share sheet – known in the browser only. */
const canShare = () =>
  typeof navigator !== "undefined" && typeof navigator.share === "function";
const noChange = () => () => {};

/**
 * A card's link to pass on: the phone's share sheet where there is one,
 * else copied – a tick says so. The link stands above in a field too, to
 * be seen and, should both fail, copied by hand.
 */
export const ShareLink = ({
  url,
  text,
  locale,
  className,
}: {
  url: string;
  /** What the share sheet sends along. */
  text: string;
  locale: Locale;
  className?: string;
}) => {
  const t = dictionaryOf(locale);
  const field = useRef<HTMLInputElement>(null);
  const share = useSyncExternalStore(noChange, canShare, () => false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2400);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard here – the link is picked in its field, to copy by hand.
      field.current?.select();
    }
  };

  const send = async () => {
    try {
      await navigator.share({ url, text });
    } catch (error) {
      // Closed without sending: nothing to do. Anything else: copied.
      if ((error as Error)?.name !== "AbortError") await copy();
    }
  };

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <span className={FIELD_BOX}>
        <input
          aria-label={t.card.copy}
          className={cn(FIELD_INPUT, "truncate py-2.5 font-medium text-sm")}
          onFocus={(event) => event.currentTarget.select()}
          readOnly
          ref={field}
          value={url}
        />
      </span>
      {share ? (
        <Button onClick={send}>{t.app.stamp.card.share}</Button>
      ) : (
        <Button onClick={copy}>
          {copied ? (
            <>
              <Check className="h-5 w-5" />
              {t.card.copied}
            </>
          ) : (
            t.card.copy
          )}
        </Button>
      )}
      <span aria-live="polite" className="sr-only">
        {copied ? t.card.copied : ""}
      </span>
    </div>
  );
};
