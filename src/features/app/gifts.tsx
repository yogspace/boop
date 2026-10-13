"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "valtio";
import { Sparkle } from "@/components/doodles";
import { SPRING } from "@/components/motion";
import { Button } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import type { StampDoc } from "@/features/calendar/model";
import { loadCard, takeCard } from "@/features/cards/client";
import { cardArrived, cardToTake } from "@/features/cards/ui/pending";
import { StampShow } from "@/features/cards/ui/stamp-show";
import { useBoop } from "@/features/offline/store";
import { STAGE } from "@/features/stickers/sticker-view";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { Sheet } from "./sheet";

/**
 * Stamps that came to the account, each greeted once with a sheet:
 *
 * - a gift from Boop (features/cards) – once per device: what showed here
 *   once is kept (`seen`), and only gifts of the last few weeks come – a new
 *   device doesn't bring up every gift there ever was;
 * - a card taken on its page (`cardArrived`), the app opening right after;
 * - a card opened before logging in (`cardToTake`) – taken here, once the
 *   account is known and there is a connection. Gone meanwhile, a sheet
 *   says so; one's own card is no card to take, and simply goes.
 */

type Arrival =
  | { kind: "gift" | "card"; stamp: string }
  | { kind: "gone"; stamp: null };

/** Where the device keeps the gifts it showed. */
const SEEN = "boop-gifts-seen";
/** As many as that – the oldest go first. */
const SEEN_MOST = 200;
/** Gifts older than this (ms) come no more – they were greeted elsewhere. */
const RECENT = 30 * 24 * 60 * 60 * 1000;
/** Something else just went: a breath before this comes (ms). */
const BREATH = 450;

const seen = {
  read: (): string[] => {
    try {
      const ids: unknown = JSON.parse(localStorage.getItem(SEEN) ?? "[]");
      return Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  },
  add: (id: string) => {
    try {
      const ids = [...seen.read().filter((known) => known !== id), id];
      localStorage.setItem(SEEN, JSON.stringify(ids.slice(-SEEN_MOST)));
    } catch {
      // No storage – it comes again next time.
    }
  },
};

/**
 * The arrivals' sheet – mount it once, beside the app's sheets, like the
 * invitations' (invitations.tsx), and with the same rules: `hold` while
 * anything else lies over the app (one sheet at a time), and a breath after
 * it went. `onShowing`: whether a sheet of it is there – until it has gone
 * for good. `onShelf`: “to the shelf” – the shelf comes into sight.
 */
export const Arrivals = ({
  locale,
  hold = false,
  onShowing,
  onShelf,
}: {
  locale: Locale;
  hold?: boolean;
  onShowing?: (showing: boolean) => void;
  onShelf?: () => void;
}) => {
  const { status, online, me, stamps } = useBoop();
  const [waiting, setWaiting] = useState<Arrival[]>([]);
  const [shown, setShown] = useState<Arrival | null>(null);
  const [present, setPresent] = useState(false);
  useEffect(() => onShowing?.(present), [present, onShowing]);

  // A card just taken on its page: greeted once its stamp is here.
  useEffect(() => {
    const stamp = cardArrived.get();
    if (!stamp) return;
    cardArrived.set(null);
    setWaiting((all) => [...all, { kind: "card", stamp }]);
  }, []);

  // A card waiting since before the login – taken now.
  const account = status === "ready" ? (me?.id ?? null) : null;
  const taking = useRef(false);
  useEffect(() => {
    const id = cardToTake.get();
    if (!(account && online && id) || taking.current) return;
    taking.current = true;
    void (async () => {
      const card = await loadCard(id);
      // One's own: nothing to take. (No answer at all: next time.)
      if (card?.mine) {
        cardToTake.set(null);
        return;
      }
      const result = await takeCard(id);
      if (result.ok) {
        cardToTake.set(null);
        trackEvent("card-taken");
        setWaiting((all) => [...all, { kind: "card", stamp: result.stamp }]);
      } else if (result.reason === "gone") {
        cardToTake.set(null);
        setWaiting((all) => [...all, { kind: "gone", stamp: null }]);
      }
    })().finally(() => {
      taking.current = false;
    });
  }, [account, online]);

  // Free once nothing else has lain over the app for a breath.
  const [free, setFree] = useState(false);
  useEffect(() => {
    if (hold || status !== "ready") {
      setFree(false);
      return;
    }
    const timer = setTimeout(() => setFree(true), BREATH);
    return () => clearTimeout(timer);
  }, [hold, status]);

  // What comes next: a card first – just taken – then the newest gift.
  const here = (arrival: Arrival) =>
    arrival.kind === "gone" || Boolean(stamps[arrival.stamp]);
  const card = waiting.find(here);
  const next = (): Arrival | null => {
    if (card) return card;
    const known = new Set(seen.read());
    const since = Date.now() - RECENT;
    const [gift] = Object.values(stamps)
      .filter(
        (s) =>
          s.origin?.kind === "gift" &&
          s.owner === me?.id &&
          !s.deleted &&
          !known.has(s.id) &&
          Date.parse(s.changedAt) > since
      )
      .sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt));
    return gift ? { kind: "gift", stamp: gift.id } : null;
  };
  if (shown) {
    // Its stamp went meanwhile (deleted elsewhere): so does its sheet.
    if (shown.stamp && !stamps[shown.stamp]) setShown(null);
  } else if (free && !hold) {
    const coming = next();
    if (coming) {
      setShown(coming);
      setPresent(true);
      if (coming === card) setWaiting((all) => all.filter((a) => a !== card));
    }
  }
  // Shown, a gift counts as seen on this device.
  useEffect(() => {
    if (shown?.kind === "gift") seen.add(shown.stamp);
  }, [shown]);

  const stamp = shown?.stamp ? stamps[shown.stamp] : null;
  return (
    <AnimatePresence onExitComplete={() => setPresent(false)}>
      {shown && (shown.kind === "gone" || stamp) && (
        <ArrivalSheet
          arrival={shown}
          key="arrival"
          locale={locale}
          onClose={() => setShown(null)}
          onShelf={() => {
            setShown(null);
            onShelf?.();
          }}
          stamp={stamp}
        />
      )}
    </AnimatePresence>
  );
};

const ArrivalSheet = ({
  arrival,
  stamp,
  locale,
  onClose,
  onShelf,
}: {
  arrival: Arrival;
  stamp: Snapshot<StampDoc> | null;
  locale: Locale;
  onClose: () => void;
  onShelf: () => void;
}) => {
  const t = dictionaryOf(locale);
  const text = t.app.arrival;
  if (arrival.kind === "gone" || !stamp) {
    return (
      <Sheet onClose={onClose} title={text.goneTitle}>
        <p className="font-medium">{text.goneText}</p>
        <Button onClick={onClose} variant="plain">
          {text.close}
        </Button>
      </Sheet>
    );
  }
  const gift = arrival.kind === "gift";
  const giver = stamp.origin?.name.split(" ")[0] ?? "";
  return (
    <Sheet onClose={onClose} title={gift ? text.giftTitle : text.cardTitle}>
      <div className="relative">
        <div className={STAGE}>
          <StampShow stamp={stamp} />
        </div>
        {/* A little to-do as it comes: two sparkles land on its corners. */}
        {(
          [
            ["-top-3 -left-2 h-7 w-7 -rotate-12", 0.45],
            ["-right-2 -bottom-3 h-5 w-5 rotate-12", 0.6],
          ] as const
        ).map(([place, delay]) => (
          <m.span
            animate={{ scale: 1, opacity: 1 }}
            aria-hidden="true"
            className={cn("pointer-events-none absolute", place)}
            initial={{ scale: 0, opacity: 0 }}
            key={place}
            transition={{ ...SPRING.bouncy, delay }}
          >
            <Sparkle className="h-full w-full" />
          </m.span>
        ))}
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <h3 className="wrap-break-word max-w-full font-black text-2xl">
          {stamp.name || t.app.stamp.untitled}
        </h3>
        <p className="font-bold text-muted">
          {gift ? t.app.stamp.origin(giver) : text.cardText(giver)}
        </p>
      </div>
      {stamp.origin?.message && (
        // The giver's words – on a slip, as they came.
        <p className="scribble scribble-thin scribble-soft wrap-break-word -rotate-1 whitespace-pre-line rounded-2xl px-4 py-3 font-medium">
          {stamp.origin.message}
        </p>
      )}
      {gift && (
        <p className="text-center font-medium text-muted text-sm">
          {text.giftText}
        </p>
      )}
      <Button onClick={onShelf} size="lg">
        {text.toShelf}
      </Button>
    </Sheet>
  );
};
