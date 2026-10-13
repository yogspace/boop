"use client";

import { useEffect, useState } from "react";
import { Bang, Check } from "@/components/doodles";
import { Button, Notice } from "@/components/ui";
import { deleteCard, myCards } from "@/features/cards/client";
import { type CardSent, cardPath } from "@/features/cards/protocol";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";

/** “12. Oktober” – this year; an earlier one says which. */
const dayOf = (iso: string, locale: Locale) => {
  const date = new Date(iso);
  return date.toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() !== new Date().getFullYear() && {
      year: "numeric",
    }),
  });
};

/**
 * The cards made of a stamp, as their giver sees them (protocol.ts,
 * `CardSent`) – a part of the stamp's sheet, under what it is shared with:
 * when each was made, its first words, who took it, its link to copy again,
 * and taking it back – asked once: the link is dead then, the copies
 * already taken stay.
 *
 * Asked from the server when the sheet opens, and again when `fresh`
 * changes (a card was just made) – with a connection; without one, a word
 * says why nothing is there.
 */
export const SentCards = ({
  stamp,
  online,
  fresh,
  locale,
}: {
  /** The stamp's id. */
  stamp: string;
  online: boolean;
  /** Anything that changes when the list is to be read anew. */
  fresh?: unknown;
  locale: Locale;
}) => {
  const t = dictionaryOf(locale);
  const text = t.app.stamp.card;
  const [cards, setCards] = useState<CardSent[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `fresh` asks anew
  useEffect(() => {
    if (!online) return;
    let live = true;
    void myCards().then((all) => {
      if (!live) return;
      // This stamp's – the latest first.
      setCards(
        all
          .filter((card) => card.stamp === stamp)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      );
    });
    return () => {
      live = false;
    };
  }, [stamp, online, fresh]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2400);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${cardPath(locale, id)}`
      );
      setCopied(id);
    } catch {
      // No clipboard here – nothing copied, nothing said.
    }
  };

  const withdraw = async (id: string) => {
    setBusy(true);
    setFailed(false);
    const ok = await deleteCard(id);
    setBusy(false);
    if (ok) {
      setAsking(null);
      setCards((all) => all?.filter((card) => card.id !== id) ?? null);
    } else setFailed(true);
  };

  if (!cards) {
    return (
      <p className="font-medium text-muted text-sm">
        {online ? t.auth.working : text.sentOffline}
      </p>
    );
  }
  if (!cards.length) {
    return <p className="font-medium text-muted text-sm">{text.sentNone}</p>;
  }
  return (
    <>
      <ul className="flex flex-col gap-2">
        {cards.map((card) => (
          <li
            className="scribble scribble-thin flex animate-fade flex-col gap-1.5 rounded-2xl px-4 py-3"
            key={card.id}
          >
            {/* When, and its first words – one line. */}
            <p className="flex min-w-0 gap-1.5 font-bold text-sm">
              <span className="shrink-0">{dayOf(card.createdAt, locale)}</span>
              {card.message && (
                <span className="truncate font-medium">· {card.message}</span>
              )}
            </p>
            <p className="wrap-break-word font-medium text-muted text-sm">
              {text.takenBy(
                card.takers.map((name) => name.split(" ")[0]).join(", ")
              )}
            </p>
            {asking === card.id ? (
              // Watch out: a thick frame and an exclamation mark, like an error.
              <div className="scribble scribble-bold mt-1 flex animate-fade flex-col gap-3 rounded-2xl p-3">
                <p className="flex items-start gap-2.5 font-bold text-sm">
                  <Bang className="h-5 w-5 shrink-0" />
                  {text.withdrawConfirm}
                </p>
                {failed && <Notice tone="error">{t.auth.failed}</Notice>}
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => {
                      setAsking(null);
                      setFailed(false);
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    {t.app.draw.cancel}
                  </Button>
                  <Button
                    disabled={busy || !online}
                    onClick={() => withdraw(card.id)}
                    size="sm"
                    variant="danger"
                  >
                    {busy ? t.auth.working : text.withdraw}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  disabled={!online}
                  onClick={() => {
                    setAsking(card.id);
                    setFailed(false);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  {text.withdraw}
                </Button>
                <Button onClick={() => copy(card.id)} size="sm" variant="plain">
                  {copied === card.id ? (
                    <>
                      <Check className="h-4 w-4" />
                      {t.card.copied}
                    </>
                  ) : (
                    t.card.copy
                  )}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <span aria-live="polite" className="sr-only">
        {copied ? t.card.copied : ""}
      </span>
    </>
  );
};
