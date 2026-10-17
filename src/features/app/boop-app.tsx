"use client";

import { AnimatePresence, m } from "motion/react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { SiteFooter } from "@/components/site-footer";
import { Button, Logo, Notice } from "@/components/ui";
import { saveLocale } from "@/features/accounts/client";
import { trackEvent } from "@/features/analytics/client";
import type { ColorName } from "@/features/calendar/model";
import { hexOf } from "@/features/calendar/palette";
import { GROUND, tintOf, tintVars } from "@/features/calendar/tint";
import {
  colorOf,
  createCalendar,
  logout,
  start,
  useBoop,
} from "@/features/offline/store";
import { deviceState, loadPush, refreshPush } from "@/features/push/client";
import { SITE_DEFAULTS } from "@/features/site/defaults";
import { useTransitionRouter } from "@/features/transitions/link";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { addressOf } from "./address";
import { AppHeader } from "./boop-app/app-header";
import { CalendarPage, VIEW_TURN } from "./boop-app/calendar-page";
import { Greeting } from "./boop-app/greeting";
import { asked, useBackAndForth, useHeldAddress } from "./boop-app/history";
import { ahead, whenIdle } from "./boop-app/later";
import {
  preloadPopups,
  preloadSheets,
  StampDrawer,
  StampSheet,
} from "./boop-app/lazy-sheets";
import { AppSheets } from "./boop-app/sheets";
import { usePlace } from "./boop-app/use-place";
import { useSheets } from "./boop-app/use-sheets";
import { useGround } from "./ground";
import { StampShelf, useShelf } from "./stamp-shelf";

/** What the shelf opens – a new stamp, a stamp's sheet. */
const shelfAhead = ahead(StampDrawer, StampSheet);

/**
 * The app: the account's calendars, the chosen one's today, month or year,
 * a day to stamp on – and, a page of their own, the 3D stamps (the shelf,
 * reached by the little pile beside the greeting). Everything reads the device's
 * copy (offline/store.ts) – it works the same without a connection.
 *
 * The chosen calendar's color sets the tone – the one the account sees it
 * in (`colorOf`: its own for it, else the calendar's). Its shades are
 * variables around everything (`tintVars`), so the ground, the calendar's
 * page and every sheet opened from it can wear them.
 *
 * Where the app is lives in the address (boop-app/use-place.ts,
 * boop-app/history.ts), what lies over it in boop-app/use-sheets.ts; the
 * parts it shows are in boop-app/ too.
 */
export const BoopApp = ({ locale: first }: { locale: Locale }) => {
  // The language changes in place (LocaleSwitch's `onPick`, in the account's
  // sheet): the words swap, nothing is built anew – the bar, the calendar's
  // ground, an open month all stay. Only the page's title has to follow by
  // hand.
  const [locale, setLocale] = useState(first);
  const t = dictionaryOf(locale);
  useEffect(() => {
    if (locale !== first) document.title = `${t.nav.openApp} · ${t.meta.short}`;
  }, [locale, first, t]);
  const boop = useBoop();
  const router = useTransitionRouter();
  // The stamps, in the order the device keeps – the shelf's and the day's
  // tray's, one choice for both (stamp-shelf.tsx).
  const shelf = useShelf();
  const place = usePlace({ boop, locale, settle: shelf.settle });
  const sheets = useSheets({ boop, place });
  const { shown, calendar, view, openDay, shownId, slug } = place;
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    void start();
  }, []);
  // The popups' files come while the device's copy opens (lazy-sheets.ts).
  useEffect(preloadPopups, []);

  // A device that said yes to notifications says so again, once the account
  // is known and there is a connection: that ties it to this login, its
  // zone and the language (push/client.ts). Nothing is asked, nothing
  // loaded where they are off on the device – and without the server's key
  // nothing happens at all.
  // Once per account – another one logged into in this tab says it anew.
  const pushFor = boop.status === "ready" ? (boop.me?.id ?? null) : null;
  const confirmed = useRef<string | null>(null);
  useEffect(() => {
    if (!pushFor || confirmed.current === pushFor || !boop.online) return;
    confirmed.current = pushFor;
    void deviceState()
      .then((device) => (device === "on" ? loadPush() : null))
      .then(
        (push) =>
          push?.publicKey && refreshPush(locale, push.publicKey, pushFor)
      )
      .catch(() => {
        // No connection after all – the next start says it.
      });
  }, [pushFor, boop.online, locale]);

  useEffect(() => {
    if (boop.status === "signedOut") router.replace(`/${locale}/login`);
  }, [boop.status, locale, router]);

  // The account's mails come in the language the app is used in: switched
  // here, or opened in the other one. Told once per language – the next
  // sync brings it back in `me`; offline, the next time there is a line.
  const told = useRef<string | null>(null);
  const savedLocale = boop.me?.locale;
  useEffect(() => {
    if (boop.status !== "ready" || !boop.online || !savedLocale) return;
    if (savedLocale === locale || told.current === locale) return;
    told.current = locale;
    void saveLocale(locale).then((ok) => {
      if (!ok) told.current = null;
    });
  }, [boop.status, boop.online, savedLocale, locale]);

  // The calendar's color as this account sees it – and the ground in it,
  // once there is something to show.
  const color = calendar ? hexOf(colorOf(boop, calendar)) : null;
  useGround(boop.status === "ready" && color ? tintOf(color).bg : null);

  const ready = boop.status === "ready";
  useHeldAddress({
    locale,
    onShelf: shown.shelf,
    ready,
    shownId,
    slug,
    view,
    openDay,
    panel: sheets.panel,
  });
  // Back and forth in the history: what that entry showed – a day open in
  // it too, in its month, or a sheet.
  useBackAndForth(() => {
    const next = asked();
    if (sheets.keepDrawing(next)) return;
    place.showAsked(next);
    sheets.closeAll(next.panel);
  });
  // The sheets load when wanted – fetched ahead in the first quiet moment
  // once the app shows (lazy-sheets.ts).
  useEffect(() => (ready ? whenIdle(preloadSheets) : undefined), [ready]);

  if (boop.status === "loading" || boop.status === "signedOut") {
    return (
      <Centered>
        <Logo className="animate-pulse text-5xl" />
      </Centered>
    );
  }
  if (boop.status === "offlineNoAccount") {
    return (
      <Centered>
        <Logo className="text-5xl" />
        <Notice>{t.app.offlineNoAccount}</Notice>
      </Centered>
    );
  }

  // The day's tray – in the today view and a day's sheet alike.
  const tray = {
    stamps: shelf.stamps,
    order: shelf.order,
    onOrder: shelf.pick,
    onNew: sheets.drawFromDay,
    give: sheets.handed,
    onGiven: () => sheets.setHanded(null),
  };

  const onNewCalendar = async (name: string, color: ColorName) => {
    // Not among the slugs yet – its address follows once it is.
    place.go(await createCalendar(name, color), null);
    trackEvent("calendar-created");
  };

  const doLogout = async () => {
    if (await logout()) {
      trackEvent("logout");
      router.replace(`/${locale}`);
    }
  };

  const me = boop.me?.id;
  const firstName = boop.me?.name.split(" ")[0] ?? "";
  // Something lies over the today view – its page's keys are off then.
  const covered = menu || sheets.over;

  return (
    // The calendar's shades, around all that shows it: the frame and the
    // sheets.
    <div style={color ? (tintVars(color) as CSSProperties) : undefined}>
      {/* The same frame as the public pages – width, header, logo – so nothing
        jumps when changing between them. It stands on the calendar's ground
        (`useGround`): pencil and soft fills are set for that (`GROUND`) –
        here, not around the sheets, which stay white. */}
      <div
        className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 overflow-x-clip px-4 sm:px-6"
        style={color ? (GROUND as CSSProperties) : undefined}
      >
        <AppHeader
          locale={locale}
          menu={menu}
          onAccount={() => {
            place.stepTo({ panel: "account" });
            sheets.setAccount(true);
          }}
          onLogout={() =>
            boop.pending ? sheets.setDialog("logout") : void doLogout()
          }
          onMenu={setMenu}
        />

        {/* The two pages take turns like the views: one fades, the other
          settles in from a little below – at the top, wherever the one
          before was scrolled to. */}
        <AnimatePresence
          initial={false}
          mode="wait"
          onExitComplete={() => window.scrollTo({ top: 0 })}
        >
          {shown.shelf ? (
            <m.div
              animate="shown"
              exit="gone"
              initial="hidden"
              key="stamps"
              onFocus={shelfAhead}
              onPointerEnter={shelfAhead}
              variants={VIEW_TURN}
            >
              <StampShelf
                back={addressOf(locale, slug, view)}
                groups={shelf.groups}
                locale={locale}
                me={me}
                onBack={place.toCalendars}
                onNew={() => {
                  place.stepTo({ panel: "draw" });
                  sheets.setDrawing(true);
                }}
                onOpen={sheets.setOpened}
                onOrder={shelf.pick}
                onUnwrap={shelf.unwrap}
                order={shelf.order}
                people={boop.people}
              />
            </m.div>
          ) : (
            <m.div
              animate="shown"
              className="flex flex-col gap-4 sm:gap-6"
              exit="gone"
              initial="hidden"
              key="calendars"
              variants={VIEW_TURN}
            >
              <Greeting
                locale={locale}
                name={firstName}
                onShelf={place.toShelf}
                shelf={shelf}
              />

              <div className="flex min-w-0 flex-col gap-4">
                {!calendar && (
                  // Every calendar may go, the last one too – then this.
                  <div className="flex flex-col items-start gap-3 py-10">
                    <p className="font-bold text-muted">{t.app.noCalendar}</p>
                    <Button onClick={() => sheets.setDialog("new")}>
                      + {t.app.newCalendar}
                    </Button>
                  </div>
                )}

                {calendar && (
                  <CalendarPage
                    calendar={calendar}
                    calendars={place.calendars}
                    key={calendar.id}
                    keyboard={!(covered || sheets.inviting || sheets.arriving)}
                    locale={locale}
                    month={place.month}
                    onCalendar={(id) => place.go(id, null)}
                    onDay={place.openDayAt}
                    onMonth={place.setMonth}
                    onNewCalendar={() => sheets.setDialog("new")}
                    onPick={place.pick}
                    onSettings={() => {
                      place.stepTo({ panel: "settings" });
                      sheets.setSettings(calendar.id);
                    }}
                    onShare={() => {
                      place.stepTo({ panel: "share" });
                      sheets.setSharing(calendar.id);
                    }}
                    owner={calendar.owner === me}
                    tray={tray}
                    view={view}
                  />
                )}
              </div>
            </m.div>
          )}
        </AnimatePresence>

        <SiteFooter
          className="mt-auto px-0 pt-4 sm:px-0"
          locale={locale}
          owner={SITE_DEFAULTS.address.name}
          website={SITE_DEFAULTS.links.website}
        />
      </div>

      <AppSheets
        covered={covered}
        locale={locale}
        onLocale={setLocale}
        onLogout={() => void doLogout()}
        onNewCalendar={(name, color) => void onNewCalendar(name, color)}
        place={place}
        settle={shelf.settle}
        sheets={sheets}
        tray={tray}
      />
    </div>
  );
};

const Centered = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
    {children}
  </div>
);
