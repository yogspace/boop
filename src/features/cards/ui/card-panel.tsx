"use client";

import { m, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Star, Ticks } from "@/components/doodles";
import { Button, LinkButton, Notice } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import { loadCard, takeCard } from "@/features/cards/client";
import { type CardView, cardPath } from "@/features/cards/protocol";
import { demoStamp } from "@/features/stickers/demo";
import { stampStl, stlName } from "@/features/stickers/export-stl";
import { KnockedParcel, tapsToOpen } from "@/features/stickers/parcel-knock";
import { Sticker } from "@/features/stickers/sticker";
import { prepareUnwrap, Unwrapping } from "@/features/stickers/unwrap";
import { useTransitionRouter } from "@/features/transitions/link";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { cardArrived, cardToTake } from "./pending";
import { ShareLink } from "./share-link";
import { StampShow } from "./stamp-show";
import { Wallpaper } from "./wallpaper";

/**
 * A card's page (protocol.ts): the stamp someone sent – in 3D, on a sheet of
 * paper, with its name, who it is from and their few words – on a wallpaper
 * of its own prints (wallpaper.tsx). Whoever is logged in takes it into
 * their stamps, and is in the app next; whoever is not logs in or signs up
 * first – the card waits on the device meanwhile (pending.ts), and the app
 * takes it (features/app/arrivals.tsx). One button for all of it: the ways in
 * show only once it is pressed, so the stamp and the words have the page.
 * And for anyone: the stamp as a file for a 3D printer.
 *
 * The stamp comes wrapped, at every visit: a parcel in its color that wants
 * a few taps (stickers/parcel-knock.tsx) – the last one unwraps it
 * (stickers/unwrap.tsx), the stamp lands on its drawing where it is shown
 * off, and the rest of the card – its name, the words, the wallpaper, the
 * buttons – comes after.
 *
 * `card`: as the server read it for everyone – null for no such card,
 * undefined when it couldn't ask: then the browser asks. Who looks at it
 * the server's page doesn't know: logged in on this device (the document's
 * `data-in`, accounts/signed-in.ts), the browser asks again – whether the
 * card is one's own, or taken already. Until it has, the button waits.
 */
export const CardPanel = ({
  locale,
  id,
  card: first,
}: {
  locale: Locale;
  id: string;
  card: CardView | null | undefined;
}) => {
  const t = dictionaryOf(locale);
  const router = useTransitionRouter();
  const [card, setCard] = useState(first);
  // Who looks: not known while rendering on the server, nor before the
  // browser asked – until then the document's mark shows one set of buttons
  // or the other (`ONLY_SIGNED_OUT`, and its opposite below).
  const [viewer, setViewer] = useState<"in" | "out" | null>(null);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Not logged in, and asked to take it: the ways in.
  const [asking, setAsking] = useState(false);
  const [printing, setPrinting] = useState(false);
  // Wrapped, until enough taps came (`wants`, at random) – then opening, the
  // live unwrapping over the parcel (`covered` once it lies over it).
  const [wrapped, setWrapped] = useState(true);
  const [knocks, setKnocks] = useState(0);
  const [wants] = useState(tapsToOpen);
  const [opening, setOpening] = useState(false);
  const [covered, setCovered] = useState(false);
  const parcel = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const knock = () => {
    if (opening) return;
    // Less motion asked for: one tap, and it is open.
    if (reduced) {
      setWrapped(false);
      return;
    }
    if (knocks === 0) prepareUnwrap();
    setKnocks(knocks + 1);
    if (knocks + 1 >= wants) setOpening(true);
  };

  useEffect(() => {
    const look = () => setOnline(navigator.onLine);
    look();
    window.addEventListener("online", look);
    window.addEventListener("offline", look);
    return () => {
      window.removeEventListener("online", look);
      window.removeEventListener("offline", look);
    };
  }, []);

  // Asked from the browser: for someone logged in (whose card, taken?), and
  // when the server had no answer – again once there is a connection.
  const unknown = card === undefined;
  useEffect(() => {
    const marked = document.documentElement.hasAttribute("data-in");
    if (!(marked || unknown)) {
      setViewer("out");
      return;
    }
    if (!online) return;
    let live = true;
    void loadCard(id).then((view) => {
      if (!live) return;
      if (view) {
        setCard(view);
        // Marked as logged in, but the login is over: the ways in show.
        setViewer(view.mine === undefined ? "out" : "in");
      } else if (unknown) setCard(null);
      else setViewer(marked ? "in" : "out");
    });
    return () => {
      live = false;
    };
  }, [id, unknown, online]);

  if (card === null) {
    return (
      <Paper sticker="cloud">
        <h1 className="text-4xl">{t.card.goneTitle}</h1>
        <p className="font-medium text-muted">{t.card.goneText}</p>
        <LinkButton href={`/${locale}`} variant="plain">
          {t.card.home}
        </LinkButton>
      </Paper>
    );
  }
  if (!card) {
    return (
      <Paper sticker="cloud">
        <p className="font-medium text-muted">
          {online ? t.app.loading : t.card.offline}
        </p>
      </Paper>
    );
  }

  const take = async () => {
    setBusy(true);
    setFailed(false);
    const result = await takeCard(id);
    if (result.ok) {
      trackEvent("card-taken");
      // The app greets it (features/app/arrivals.tsx).
      cardArrived.set(result.stamp);
      router.push(`/${locale}/app`);
      return;
    }
    setBusy(false);
    if (result.reason === "login") {
      setViewer("out");
      setAsking(true);
    } else if (result.reason === "gone") setCard(null);
    else setFailed(true);
  };

  const { stamp } = card;
  const giver = card.from.split(" ")[0] ?? "";

  const download = async () => {
    setPrinting(true);
    try {
      const url = URL.createObjectURL(await stampStl(stamp));
      const link = document.createElement("a");
      link.href = url;
      link.download = stlName(stamp.name);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setPrinting(false);
    }
  };
  // Logging in or signing up was the yes: the card is taken right after.
  const later = () => cardToTake.set(id);
  const ways = (
    <>
      <p className="font-medium text-muted text-sm">{t.card.signedOut}</p>
      <LinkButton href={`/${locale}/login`} onClick={later} size="lg">
        {t.card.login}
      </LinkButton>
      <LinkButton href={`/${locale}/register`} onClick={later} variant="plain">
        {t.nav.register}
      </LinkButton>
    </>
  );
  const toApp = (
    <LinkButton href={`/${locale}/app`} variant="plain">
      {t.nav.openApp}
    </LinkButton>
  );

  if (wrapped) {
    return (
      <Paper>
        {/* Where the stamp will be shown off – as large, and in its place. */}
        <div
          className="-my-3 aspect-square w-full max-w-64 self-center"
          ref={parcel}
        >
          <button
            aria-label={t.card.parcelLabel}
            className="block h-full w-full rounded-3xl"
            onClick={knock}
            type="button"
          >
            <KnockedParcel
              className={cn(covered && "invisible")}
              color={stamp.color}
              knocks={knocks}
              opening={opening}
            />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="wrap-break-word text-4xl">{t.card.parcel(giver)}</h1>
          <p className="font-bold text-muted">{t.card.unwrap}</p>
        </div>
        {opening && (
          <Unwrapping
            anchor={() => parcel.current}
            color={stamp.color}
            landing={{ inset: STAMP_INSET }}
            onDone={() => setOpening(false)}
            onOpened={() => setWrapped(false)}
            onShown={() => setCovered(true)}
            stamp={stamp}
            tilt={0}
          />
        )}
      </Paper>
    );
  }

  return (
    <>
      <Wallpaper seed={id} stamp={stamp} />
      <Paper>
        <StampShow className="-my-3 max-w-64 self-center" stamp={stamp} />
        {/* Unwrapped: the rest of the card comes up after the stamp. */}
        <m.div
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-5"
          initial={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.35, delay: 0.25, ease: "easeOut" }}
        >
          <div className="flex flex-col gap-1">
            <h1 className="wrap-break-word text-4xl">
              {stamp.name || t.app.stamp.untitled}
            </h1>
            <p className="font-bold text-muted">{t.app.stamp.origin(giver)}</p>
          </div>
          {card.message && (
            // The giver's words – on a slip laid on the sheet, a little askew.
            <p className="scribble scribble-thin scribble-soft wrap-break-word -rotate-1 whitespace-pre-line rounded-2xl px-4 py-3 text-left font-medium">
              {card.message}
            </p>
          )}
          <div className="flex flex-col gap-2.5 pt-1">
            {viewer === "in" && card.mine ? (
              <>
                <div className="text-left">
                  <h2 className="font-black text-lg">{t.card.mine}</h2>
                  <p className="font-medium text-muted text-sm">
                    {t.card.mineText}
                  </p>
                </div>
                <ShareLink
                  locale={locale}
                  text={t.app.stamp.card.shareText(stamp.name)}
                  url={`${window.location.origin}${cardPath(locale, id)}`}
                />
                {toApp}
              </>
            ) : viewer === "in" && card.taken ? (
              <>
                <Notice tone="success">{t.card.taken}</Notice>
                {toApp}
              </>
            ) : asking ? (
              ways
            ) : (
              <>
                {failed && <Notice tone="error">{t.auth.failed}</Notice>}
                <Button
                  disabled={viewer === null || busy || !online}
                  onClick={viewer === "in" ? take : () => setAsking(true)}
                  size="lg"
                >
                  {busy ? t.auth.working : t.card.take}
                </Button>
                {!online && (
                  <p className="font-medium text-muted text-xs">
                    {t.auth.offline}
                  </p>
                )}
              </>
            )}
            {/* For anyone, with an account or without. */}
            <Button
              className="self-center"
              disabled={printing}
              onClick={download}
              size="sm"
              variant="ghost"
            >
              {printing ? t.auth.working : t.app.stamp.print3d}
            </Button>
          </div>
        </m.div>
      </Paper>
    </>
  );
};

/** How far in the shown-off stamp's drawing lies (px, stamp-show.tsx). */
const STAMP_INSET = 12;

/**
 * The page's sheet of paper, like the account pages' (accounts/forms.tsx):
 * a scribbled frame, in the middle of the page. `sticker`: a stamp on its
 * corner – for the pages without a card's own.
 */
const Paper = ({
  sticker,
  children,
}: {
  sticker?: string;
  children: ReactNode;
}) => (
  <div className="mx-auto w-full max-w-md px-4 pt-8 pb-16 sm:pt-12">
    <div className="scribble flex flex-col gap-5 rounded-[32px] p-6 text-center sm:p-8">
      {sticker ? (
        <div
          className="absolute -top-10 -right-1 w-24 animate-float sm:-right-4"
          style={{ "--tilt": "10deg" } as React.CSSProperties}
        >
          <Sticker stamp={demoStamp(sticker)} />
        </div>
      ) : (
        <Ticks className="absolute -top-7 right-10 h-5 w-8 -rotate-[20deg]" />
      )}
      <Star className="absolute -top-3.5 left-8 h-7 w-7 -rotate-12" />
      {children}
    </div>
  </div>
);
