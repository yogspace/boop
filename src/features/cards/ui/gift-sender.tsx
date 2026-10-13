"use client";

import { type FormEvent, useState } from "react";
import { Bang } from "@/components/doodles";
import { Button, FIELD_BOX, FIELD_INPUT, Notice } from "@/components/ui";
import { sendGiftOf } from "@/features/cards/client";
import { MESSAGE_MAX } from "@/features/cards/protocol";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

/**
 * A stamp of one's own sent to everyone, as a gift from Boop (gifts.ts): a
 * few words with it, if one likes – then asked once more, in the frame of a
 * warning, because it can't be taken back – and, once sent, to how many
 * accounts it is on its way. A section of the stamp's sheet (features/app/
 * stamp-sheet.tsx), for a stamp its owner drew – and only for an account
 * with the admin box: the server asks again. Needs a connection.
 */
export const GiftSender = ({
  stamp,
  online,
  locale,
}: {
  /** The stamp's id. */
  stamp: string;
  online: boolean;
  locale: Locale;
}) => {
  const t = dictionaryOf(locale);
  const text = t.app.stamp.gift;
  const [message, setMessage] = useState("");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);

  const ask = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSure(true);
  };

  const send = async () => {
    setBusy(true);
    const result = await sendGiftOf(stamp, message);
    setBusy(false);
    setSure(false);
    if (result.ok) {
      setSent(result.sent);
      return;
    }
    setError(result.reason === "failed" ? t.auth.failed : text[result.reason]);
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-black text-lg">{text.title}</h3>
      <p className="font-medium text-muted text-sm">{text.text}</p>
      {sent === null ? (
        <form className="flex flex-col gap-2.5 pt-1" onSubmit={ask}>
          <label className="flex flex-col gap-2">
            <span className="font-bold text-sm">{text.message}</span>
            <span className={FIELD_BOX}>
              <textarea
                className={cn(
                  FIELD_INPUT,
                  "field-sizing-content min-h-20 resize-none leading-relaxed"
                )}
                disabled={sure}
                maxLength={MESSAGE_MAX}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={text.messagePlaceholder}
                rows={2}
                value={message}
              />
            </span>
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          {sure ? (
            // Watch out: a thick frame and an exclamation mark, like an error.
            <div className="scribble scribble-bold flex animate-fade flex-col gap-3 rounded-2xl p-4">
              <p className="flex items-start gap-2.5 font-bold">
                <Bang className="h-6 w-6 shrink-0" />
                {text.confirm}
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  disabled={busy}
                  onClick={() => setSure(false)}
                  size="sm"
                  variant="ghost"
                >
                  {t.app.draw.cancel}
                </Button>
                <Button
                  disabled={busy || !online}
                  onClick={() => void send()}
                  size="sm"
                  variant="danger"
                >
                  {busy ? t.auth.working : text.yes}
                </Button>
              </div>
            </div>
          ) : (
            <Button disabled={!online} type="submit" variant="plain">
              {text.send}
            </Button>
          )}
          {/* Asleep without a connection – and why. */}
          {!online && (
            <p className="font-medium text-muted text-xs">{text.offline}</p>
          )}
        </form>
      ) : (
        // On its way – in the background, to this many.
        <p aria-live="polite" className="animate-fade pt-1 font-bold">
          {text.sent(sent)}
        </p>
      )}
    </div>
  );
};
