"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Star, Ticks } from "@/components/doodles";
import { Button, LinkButton, Notice } from "@/components/ui";
import { ONLY_SIGNED_IN, ONLY_SIGNED_OUT } from "@/features/accounts/signed-in";
import { trackEvent } from "@/features/analytics/client";
import { loadCard, takeCard } from "@/features/cards/client";
import { type CardView, cardPath } from "@/features/cards/protocol";
import { demoStamp } from "@/features/stickers/demo";
import { Sticker } from "@/features/stickers/sticker";
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
 * takes it (features/app/gifts.tsx).
 *
 * `card`: as the server read it for everyone – null for no such card,
 * undefined when it couldn't ask: then the browser asks. Who looks at it
 * the server's page doesn't know: logged in on this device (the document's
 * `data-in`, accounts/signed-in.ts), the browser asks again – whether the
 * card is one's own, or taken already.
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
      // The app greets it (features/app/gifts.tsx).
      cardArrived.set(result.stamp);
      router.push(`/${locale}/app`);
      return;
    }
    setBusy(false);
    if (result.reason === "login") setViewer("out");
    else if (result.reason === "gone") setCard(null);
    else setFailed(true);
  };

  const { stamp } = card;
  const giver = card.from.split(" ")[0] ?? "";
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

  return (
    <>
      <Wallpaper seed={id} stamp={stamp} />
      <Paper>
        <StampShow className="-my-3 max-w-64 self-center" stamp={stamp} />
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
          {viewer === null && (
            // Before the browser knows: by the document's mark.
            <>
              <div className={cn("flex flex-col gap-2.5", ONLY_SIGNED_OUT)}>
                {ways}
              </div>
              <Button className={ONLY_SIGNED_IN} disabled size="lg">
                {t.card.take}
              </Button>
            </>
          )}
          {viewer === "out" && ways}
          {viewer === "in" &&
            (card.mine ? (
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
            ) : card.taken ? (
              <>
                <Notice tone="success">{t.card.taken}</Notice>
                {toApp}
              </>
            ) : (
              <>
                {failed && <Notice tone="error">{t.auth.failed}</Notice>}
                <Button disabled={busy || !online} onClick={take} size="lg">
                  {busy ? t.auth.working : t.card.take}
                </Button>
                {!online && (
                  <p className="font-medium text-muted text-xs">
                    {t.auth.offline}
                  </p>
                )}
              </>
            ))}
        </div>
      </Paper>
    </>
  );
};

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
