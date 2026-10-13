"use client";

import { type FormEvent, useState } from "react";
import { Button, FIELD_BOX, FIELD_INPUT, Notice } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import { createCard } from "@/features/cards/client";
import { cardPath, MESSAGE_MAX } from "@/features/cards/protocol";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { ShareLink } from "./share-link";

/**
 * A stamp of one's own sent as a card (protocol.ts): a few words with it,
 * if one likes, then its link – to share, or to copy. A section of the
 * stamp's sheet (features/app/stamp-sheet.tsx), for a stamp its owner drew.
 * Needs a connection: the card is on the server. `onMade`: a card was just
 * made – the sheet's list of them (sent-cards.tsx) reads anew.
 */
export const CardSender = ({
  stamp,
  name,
  online,
  locale,
  onMade,
}: {
  /** The stamp's id. */
  stamp: string;
  /** Its name – for what the share sheet sends along. */
  name: string;
  online: boolean;
  locale: Locale;
  onMade?: () => void;
}) => {
  const t = dictionaryOf(locale);
  const text = t.app.stamp.card;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);

  const make = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await createCard(stamp, message);
    setBusy(false);
    if (result.ok) {
      setMade(`${window.location.origin}${cardPath(locale, result.id)}`);
      trackEvent("card-created");
      onMade?.();
    } else {
      setError(result.reason === "tooMany" ? text.tooMany : t.auth.failed);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-black text-lg">{text.title}</h3>
      <p className="font-medium text-muted text-sm">{text.text}</p>
      {made ? (
        // Made: its link, to pass on – or another card, other words.
        <div className="flex animate-fade flex-col gap-2.5 pt-1">
          <ShareLink locale={locale} text={text.shareText(name)} url={made} />
          <Button
            onClick={() => {
              setMade(null);
              setMessage("");
            }}
            size="sm"
            variant="ghost"
          >
            {text.another}
          </Button>
        </div>
      ) : (
        <form className="flex flex-col gap-2.5 pt-1" onSubmit={make}>
          <label className="flex flex-col gap-2">
            <span className="font-bold text-sm">{text.message}</span>
            <span className={FIELD_BOX}>
              <textarea
                className={cn(
                  FIELD_INPUT,
                  "field-sizing-content min-h-20 resize-none leading-relaxed"
                )}
                maxLength={MESSAGE_MAX}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={text.messagePlaceholder}
                rows={2}
                value={message}
              />
            </span>
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <Button disabled={busy || !online} type="submit" variant="plain">
            {busy ? t.auth.working : text.create}
          </Button>
          {/* Asleep without a connection – and why. */}
          {!online && (
            <p className="font-medium text-muted text-xs">{text.offline}</p>
          )}
        </form>
      )}
    </div>
  );
};
