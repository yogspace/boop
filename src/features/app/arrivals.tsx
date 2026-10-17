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
 * Cards that came to the account, each greeted once with a sheet:
 *
 * - a card taken on its page (`cardArrived`), the app opening right after;
 * - a card opened before logging in (`cardToTake`) – taken here, once the
 *   account is known and there is a connection. Gone meanwhile, a sheet
 *   says so; one's own card is no card to take, and simply goes.
 *
 * A gift from Boop has no sheet: it comes wrapped, a parcel on the shelf
 * (stamp-shelf.tsx), and is unwrapped there.
 */

type Arrival = { kind: "card"; stamp: string } | { kind: "gone"; stamp: null };

/** Something else just went: a breath before this comes (ms). */
const BREATH = 450;

/** Where an app from before kept the gifts it had greeted. */
const GIFTS_SEEN = "boop-gifts-seen";

/**
 * The arrivals' sheet – mount it once, beside the app's sheets, like the
 * invitations' (invitations.tsx), and with the same rules: `hold` while
 * anything else lies over the app (one sheet at a time), and a breath after
 * it went. `onShowing`: whether a sheet of it is there – until it has gone
 * for good. `onShelf`: “to your stamps” – the shelf, the page with them.
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

  // Gifts have no sheet any more – what the device kept of them goes.
  useEffect(() => {
    try {
      localStorage.removeItem(GIFTS_SEEN);
    } catch {
      // No storage – nothing kept.
    }
  }, []);

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

  // Free once nothing else has lain over the app for a breath – its own
  // sheet before included (`round`): one goes before the next comes.
  const [free, setFree] = useState(false);
  const [round, setRound] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `round` starts the breath anew
  useEffect(() => {
    if (hold || status !== "ready") {
      setFree(false);
      return;
    }
    const timer = setTimeout(() => setFree(true), BREATH);
    return () => clearTimeout(timer);
  }, [hold, status, round]);
  const close = () => {
    setShown(null);
    setFree(false);
    setRound((n) => n + 1);
  };

  // What comes next: a card whose stamp is here.
  const here = (arrival: Arrival) =>
    arrival.kind === "gone" || Boolean(stamps[arrival.stamp]);
  const card = waiting.find(here);
  if (shown) {
    // Its stamp went meanwhile (deleted elsewhere): so does its sheet.
    if (shown.stamp && !stamps[shown.stamp]) close();
  } else if (free && !hold && card) {
    setShown(card);
    setPresent(true);
    setWaiting((all) => all.filter((a) => a !== card));
  }

  const stamp = shown?.stamp ? stamps[shown.stamp] : null;
  return (
    <AnimatePresence onExitComplete={() => setPresent(false)}>
      {shown && (shown.kind === "gone" || stamp) && (
        <ArrivalSheet
          arrival={shown}
          key="arrival"
          locale={locale}
          onClose={close}
          onShelf={() => {
            close();
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
  const giver = stamp.origin?.name.split(" ")[0] ?? "";
  return (
    <Sheet onClose={onClose} title={text.cardTitle}>
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
        <p className="font-bold text-muted">{text.cardText(giver)}</p>
      </div>
      {stamp.origin?.message && (
        // The giver's words – on a slip, as they came.
        <p className="scribble scribble-thin scribble-soft wrap-break-word -rotate-1 whitespace-pre-line rounded-2xl px-4 py-3 font-medium">
          {stamp.origin.message}
        </p>
      )}
      <Button onClick={onShelf} size="lg">
        {text.toShelf}
      </Button>
    </Sheet>
  );
};
