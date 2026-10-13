"use client";

import { AnimatePresence, m, type Variants } from "motion/react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Plus, Sparkle, Squiggle, Ticks } from "@/components/doodles";
import { LocaleSwitch } from "@/components/locale-switch";
import { SPRING } from "@/components/motion";
import { SiteFooter } from "@/components/site-footer";
import {
  BADGE,
  Button,
  Logo,
  Notice,
  PILL,
  ROUND_BUTTON,
} from "@/components/ui";
import { saveLocale } from "@/features/accounts/client";
import { trackEvent } from "@/features/analytics/client";
import {
  type ColorName,
  type DayKey,
  stampsOf,
} from "@/features/calendar/model";
import { hexOf, nextKey } from "@/features/calendar/palette";
import { GROUND, PAPER, tintOf, tintVars } from "@/features/calendar/tint";
import {
  type CalendarView,
  colorOf,
  createCalendar,
  logout,
  prefOf,
  setCalendarPref,
  start,
  useBoop,
} from "@/features/offline/store";
import { deviceState, loadPush, refreshPush } from "@/features/push/client";
import { SITE_DEFAULTS } from "@/features/site/defaults";
import { Sticker } from "@/features/stickers/sticker";
import { Link, useTransitionRouter } from "@/features/transitions/link";
import { LOCALES, type Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { AccountSheet } from "./account-sheet";
import {
  type Address,
  addressOf,
  calendarOf,
  type Open,
  type Panel,
  readAddress,
  slugsOf,
} from "./address";
import { CalendarSettings, PersonPlus, Sliders } from "./calendar-settings";
import { DaySheet } from "./day-sheet";
import { CalendarSheet, ConfirmSheet } from "./dialogs";
import { FADING, useFadingEdges } from "./fading-edges";
import { useGround } from "./ground";
import { Invitations } from "./invitations";
import { MonthGrid } from "./month-grid";
import { NameTag } from "./name-tag";
import { ShareSheet } from "./share-sheet";
import { StampDrawer } from "./stamp-drawer";
import { StampSheet } from "./stamp-sheet";
import { SyncMark, SyncStatus } from "./sync-badge";
import { TodayView } from "./today-view";
import { useDismiss } from "./use-dismiss";
import { ViewSwitch } from "./view-switch";
import { YearGrid } from "./year-grid";

/** A stable little tilt per stamp – the shelf looks hand-placed. */
const tilt = (id: string) => ((id.charCodeAt(0) + id.charCodeAt(5)) % 9) - 4;

/**
 * Where a history entry of the app keeps the calendar it showed – by its
 * id, so a reload or the back button finds it even when its name (and so
 * its address) has changed meanwhile.
 */
const HELD = "boop";

/**
 * What the address asks for (address.ts) – only the browser knows: the
 * server's page is the same for every calendar. The calendar is the one the
 * history entry kept, where it kept one, else the one the address names.
 */
const asked = (): Address => {
  if (typeof window === "undefined") {
    return { calendar: null, view: null, day: null, panel: null };
  }
  const address = readAddress(window.location.pathname);
  const held: unknown = window.history.state?.[HELD]?.calendar;
  return {
    calendar: typeof held === "string" ? held : address.calendar,
    view: address.view,
    day: address.day,
    panel: address.panel,
  };
};

/** The month a day is in – where the month and the year open with it. */
const monthOf = (day: DayKey) => ({
  year: Number(day.slice(0, 4)),
  month: Number(day.slice(5, 7)) - 1,
});

/**
 * The views take turns quietly: one fades, the other settles in from a
 * little below. Up and down, not sideways – the calendar's page reaches the
 * screen's edges on a phone, and a step aside would take it past them.
 */
const VIEW_TURN: Variants = {
  hidden: { opacity: 0, y: 10 },
  shown: {
    opacity: 1,
    y: 0,
    transition: { ...SPRING.soft, opacity: { duration: 0.2 } },
  },
  gone: {
    opacity: 0,
    transition: { duration: 0.12, ease: "easeIn" },
  },
};

/**
 * The calendars' pills on the colored ground: see-through, the ground
 * showing – but the chosen one, which is paper white like the sheet it
 * belongs to, with a thicker line (not filled with ink: its words stay ink).
 */
const PILL_ON_GROUND =
  "scribble-clear aria-pressed:scribble-bold aria-pressed:[--scribble-fill:var(--color-card)]! aria-pressed:text-ink!";

/**
 * The app: the account's calendars, a month of the chosen one, a day to
 * stamp on, the 3D stamps. Everything reads the device's copy
 * (offline/store.ts) – it works the same without a connection.
 *
 * The chosen calendar's color sets the tone – the one the account sees it
 * in (`colorOf`: its own for it, else the calendar's). Its shades are
 * variables around everything (`tintVars`), so the ground, the calendar's
 * page and every sheet opened from it can wear them.
 */
export const BoopApp = ({ locale: first }: { locale: Locale }) => {
  // The language changes in place (LocaleSwitch's `onPick`): the words swap,
  // nothing is built anew – the bar, the calendar's ground, an open month
  // all stay. Only the page's title has to follow by hand.
  const [locale, setLocale] = useState(first);
  const t = dictionaryOf(locale);
  useEffect(() => {
    if (locale !== first) document.title = `${t.nav.openApp} · ${t.meta.short}`;
  }, [locale, first, t]);
  const boop = useBoop();
  const router = useTransitionRouter();
  // The calendar and the view showing live in the address, so a reload
  // stays on them, and a link opens them. The calendar: its id once found,
  // before that what the address named (a slug, or an id). The view: null
  // for the one last chosen for that calendar – or today. The server
  // renders none – no matter: until the device's copy is open (status
  // "loading", always so while hydrating) no calendar shows.
  const [shown, setShown] = useState(asked);
  // A day open in the month or the year – in the address too, so a reload
  // or a link opens it again, in its month.
  const [day, setDay] = useState<DayKey | null>(shown.day);
  const [month, setMonth] = useState(() => {
    if (shown.day) return monthOf(shown.day);
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [drawing, setDrawing] = useState(false);
  // Something drawn in the new stamp's editor: the browser's back doesn't
  // throw it away – it stays, and the editor asks (`ask` counts up).
  const drawn = useRef(false);
  const [askLeave, setAskLeave] = useState(0);
  // An invitation's popup over the app (invitations.tsx).
  const [inviting, setInviting] = useState(false);
  const noteDrawn = useRef((now: boolean) => {
    drawn.current = now;
  }).current;
  // Whose share sheet, whose settings are open – by id: should that calendar
  // go meanwhile (deleted, or someone took the account out), its sheet goes
  // too, rather than turn into another calendar's.
  const [sharing, setSharing] = useState<string | null>(null);
  const [settings, setSettings] = useState<string | null>(null);
  // From the settings on to the share sheet: one goes, then the next comes –
  // two at once would undo each other's hold on the page behind (sheet.tsx).
  const shareNext = useRef<string | null>(null);
  const [account, setAccount] = useState(false);
  // A sheet the address asks for (a reload, a link, back and forth) – it
  // opens once the calendar it belongs to is known.
  const [asking, setAsking] = useState<Panel | null>(shown.panel);
  const [menu, setMenu] = useState(false);
  // The account's menu closes with a press elsewhere, or Escape.
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuBox = useRef<HTMLDivElement>(null);
  useDismiss(menu, () => setMenu(false), menuButton, menuBox);
  const [opened, setOpened] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"new" | "logout" | null>(null);
  // The calendars' row – on a phone it scrolls sideways, and fades where it
  // goes on.
  const pills = useFadingEdges<HTMLElement>("x");

  useEffect(() => {
    void start();
  }, []);

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

  const calendars = useMemo(
    () =>
      Object.values(boop.calendars).sort(
        (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
      ),
    [boop.calendars]
  );
  const me = boop.me?.id;
  // Each calendar's slug in the address – for both languages: they differ
  // where a name leaves none (“kalender”, “calendar”).
  const slugs = useMemo(
    () =>
      Object.fromEntries(
        LOCALES.map((l) => [l, slugsOf(calendars, me, l)])
      ) as Record<Locale, Map<string, string>>,
    [calendars, me]
  );
  // The one the address names – or the first, when it names none of the
  // account's (or one that is gone).
  const named = calendarOf(shown.calendar, slugs[locale]);
  const calendar =
    calendars.find((c) => c.id === named) ?? calendars[0] ?? null;
  // Found, it is held by its id: renamed, it stays.
  if (calendar && shown.calendar !== calendar.id) {
    setShown({ ...shown, calendar: calendar.id });
  }
  const view: CalendarView =
    shown.view ?? (calendar && prefOf(boop, calendar.id).view) ?? "today";
  // The today view is a day of its own – none opens over it.
  const openDay = view === "today" ? null : day;
  if (asking && boop.status === "ready" && calendar) {
    setAsking(null);
    if (asking === "settings") setSettings(calendar.id);
    // Sharing is the owner's – for anyone else the address asks for nothing.
    if (asking === "share" && calendar.owner === boop.me?.id) {
      setSharing(calendar.id);
    }
    if (asking === "account") setAccount(true);
    if (asking === "draw") setDrawing(true);
  }
  // The sheet open over the view, for the address – the share sheet already
  // while the settings make way for it.
  const shownId = calendar?.id;
  const panel: Panel | null = drawing
    ? "draw"
    : account
      ? "account"
      : shownId && settings === shownId
        ? "settings"
        : shownId && (sharing ?? shareNext.current) === shownId
          ? "share"
          : null;
  // The calendar's color as this account sees it – and the ground in it,
  // once there is something to show.
  const color = calendar ? hexOf(colorOf(boop, calendar)) : null;
  useGround(boop.status === "ready" && color ? tintOf(color).bg : null);
  // The same in every calendar: mine, then what others share with me.
  const myStamps = useMemo(
    () => stampsOf(Object.values(boop.stamps), me, Object.keys(boop.calendars)),
    [boop.stamps, boop.calendars, me]
  );
  // On the shelf someone else's stamp wears their first name – and one of
  // mine that others may use too, two rings.
  const nameOf = (id: string) => boop.people[id]?.split(" ")[0] || "?";
  const whose = (s: { owner: string; sharedWith: readonly string[] }) => {
    if (s.owner !== me) return t.app.stamp.by(nameOf(s.owner));
    return s.sharedWith.length > 0 ? t.app.stamp.shared : "";
  };

  // Whatever shows is in the address – /de/app/familie/heute (address.ts).
  // A step of one's own (another calendar, the other view) is a new entry
  // in the history (`go`, below); this sets the address right in place: the
  // first time, for an address naming none or another calendar (one that
  // is gone), after a rename, in the other language. The entry keeps the
  // calendar's id besides (`HELD`). No navigation: the page stays as it is
  // – Next learns the new path from `history` itself (usePathname), and
  // adds its own state to ours.
  const slug = shownId && slugs[locale].get(shownId);
  useEffect(() => {
    if (!shownId) return;
    const path = addressOf(locale, slug, view, { day: openDay, panel });
    const { pathname, search, hash } = window.location;
    const held = window.history.state?.[HELD];
    if (pathname === path && held?.calendar === shownId) return;
    // The entry of a day or a sheet stays a step of its own (`stepped`,
    // `stepTo`) – in the other language too, and from the settings on to
    // the share sheet.
    window.history.replaceState(
      { [HELD]: { ...((openDay || panel) && held), calendar: shownId } },
      "",
      `${path}${search}${hash}`
    );
  }, [locale, shownId, slug, view, openDay, panel]);

  // Back and forth in the history: what that entry showed – a day open in
  // it too, in its month, or a sheet.
  useEffect(() => {
    const onPop = () => {
      const next = asked();
      if (drawn.current) {
        // Back from the editor with something drawn: forward again to its
        // entry, and the question – and nothing else on the way back.
        if (next.panel !== "draw") {
          window.history.go(1);
          setAskLeave((n) => n + 1);
        }
        return;
      }
      setShown(next);
      setDay(next.day);
      if (next.day) setMonth(monthOf(next.day));
      setSettings(null);
      setSharing(null);
      setAccount(false);
      setDrawing(false);
      shareNext.current = null;
      setAsking(next.panel);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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

  /**
   * Shows a calendar – in `next` view, or the one last chosen for it – as a
   * step of its own: back goes to what showed before.
   */
  const go = (id: string, next: CalendarView | null) => {
    const path = addressOf(
      locale,
      slugs[locale].get(id),
      next ?? prefOf(boop, id).view ?? "today"
    );
    const { pathname, search, hash } = window.location;
    if (pathname !== path) {
      window.history.pushState(
        { [HELD]: { calendar: id } },
        "",
        `${path}${search}${hash}`
      );
    }
    setShown({ calendar: id, view: next, day: null, panel: null });
    setDay(null);
  };

  /** The other view – kept for the calendar, it opens in it next time. */
  const pick = (next: CalendarView) => {
    if (!calendar || next === view) return;
    go(calendar.id, next);
    void setCalendarPref(calendar.id, { view: next });
  };

  /**
   * A day or a sheet opens over the view – a step of its own in the
   * history: back closes it, and closing it goes back (`closeStep`).
   */
  const stepTo = (open: Open) => {
    const path = addressOf(locale, slug, view, open);
    const { search, hash } = window.location;
    window.history.pushState(
      { [HELD]: { calendar: shownId, stepped: true } },
      "",
      `${path}${search}${hash}`
    );
  };

  /**
   * A day or a sheet closes: where opening it was a step, a step back –
   * otherwise (it came with the address: a reload, a link) the address
   * simply loses it.
   */
  const closeStep = (close: () => void) => () => {
    if (window.history.state?.[HELD]?.stepped) window.history.back();
    else close();
  };

  /** A day's sheet, from the month or the year. */
  const openDayAt = (key: DayKey) => {
    stepTo({ day: key });
    setDay(key);
    trackEvent("day-opened");
  };

  const onNewCalendar = async (name: string, color: ColorName) => {
    // Not among the slugs yet – its address follows once it is.
    go(await createCalendar(name, color), null);
    trackEvent("calendar-created");
  };

  const doLogout = async () => {
    if (await logout()) {
      trackEvent("logout");
      router.replace(`/${locale}`);
    }
  };

  const owner = calendar && calendar.owner === me;
  const firstName = boop.me?.name.split(" ")[0] ?? "";
  // The address in the other language – the view's word changes with it.
  const addressIn = (other: Locale) =>
    addressOf(other, calendar && slugs[other].get(calendar.id), view, {
      day: openDay,
      panel,
    });
  // Something lies over the today view – its page's keys are off then.
  const covered = Boolean(
    menu ||
      openDay ||
      drawing ||
      sharing ||
      settings ||
      account ||
      dialog ||
      opened
  );

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
        <header className="flex items-center justify-between gap-4 py-5">
          <Link aria-label={t.nav.home} href={`/${locale}`}>
            <Logo className="text-[32px]" />
          </Link>
          <div className="relative flex items-center gap-2">
            {/* On a phone the bar is full – there it is in the menu. */}
            <LocaleSwitch
              className="mr-1 max-sm:hidden"
              hrefOf={addressIn}
              locale={locale}
              onPick={setLocale}
            />
            <button
              aria-expanded={menu}
              aria-label={t.app.account}
              className={cn(
                ROUND_BUTTON,
                "relative aria-expanded:scribble-ink"
              )}
              onClick={() => setMenu(!menu)}
              ref={menuButton}
              type="button"
            >
              {firstName.slice(0, 1).toUpperCase() || "?"}
              {/* Changes waiting, or offline – the menu says more. */}
              <SyncMark locale={locale} />
            </button>
            {/* Unfolds from the button, and folds back into it. */}
            <AnimatePresence>
              {menu && (
                <m.div
                  animate={{
                    y: 0,
                    scale: 1,
                    opacity: 1,
                    transition: { ...SPRING.soft, opacity: { duration: 0.15 } },
                  }}
                  className="scribble absolute top-13 right-0 z-40 flex w-60 origin-top-right flex-col gap-3 rounded-3xl p-4"
                  exit={{
                    y: -6,
                    scale: 0.96,
                    opacity: 0,
                    transition: { duration: 0.15, ease: "easeIn" },
                  }}
                  initial={{ y: -8, scale: 0.96, opacity: 0 }}
                  ref={menuBox}
                >
                  <div>
                    <p className="font-black">{boop.me?.name}</p>
                    <p className="truncate text-muted text-sm">
                      {boop.me?.email}
                    </p>
                  </div>
                  <SyncStatus locale={locale} />
                  <LocaleSwitch
                    className="sm:hidden"
                    hrefOf={addressIn}
                    locale={locale}
                    onPick={setLocale}
                  />
                  <Button
                    onClick={() => {
                      setMenu(false);
                      stepTo({ panel: "account" });
                      setAccount(true);
                    }}
                    size="sm"
                    variant="plain"
                  >
                    {t.app.accountSheet.title}
                    {/* The invitations wait in there. */}
                    {boop.invitations.length > 0 && (
                      <>
                        <span
                          aria-hidden="true"
                          className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-ink px-1 font-black text-[10px] text-white leading-none"
                        >
                          {boop.invitations.length}
                        </span>
                        <span className="sr-only">
                          {t.app.invitations.count(boop.invitations.length)}
                        </span>
                      </>
                    )}
                  </Button>
                  <Button
                    disabled={!boop.online}
                    onClick={() =>
                      boop.pending ? setDialog("logout") : void doLogout()
                    }
                    size="sm"
                    variant="plain"
                  >
                    {t.app.logout}
                  </Button>
                  {!boop.online && (
                    <p className="text-muted text-xs">{t.app.logoutOffline}</p>
                  )}
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        <section className="-mt-2">
          <h1 className="text-4xl sm:text-5xl">
            {t.app.hello(firstName)}
            <Ticks className="ml-1 inline h-[0.5em] w-[0.8em] -translate-y-[0.5em] rotate-[24deg]" />
          </h1>
          <p className="mt-1 font-medium text-muted">{t.app.lead}</p>
        </section>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            {/* On phones a row to swipe, edge to edge – sideways only: up and
              down the swipe is the page's. A scroller cuts off all round, so
              it pads (and margins back) room for all a pill's frame may
              reach – its wobble, lift and focus ring, 14px and a little:
              with less, the row would scroll up and down by what sticks
              out. No bar – it fades where it goes on (fading-edges.ts).
              Wider, they wrap: nothing cut, nothing masked. */}
            <nav
              aria-label={t.app.calendars}
              className={cn(
                "-m-4 flex gap-2.5 overflow-x-auto overflow-y-hidden overscroll-x-contain p-4 sm:m-0 sm:flex-wrap sm:overflow-visible sm:mask-none sm:p-0",
                FADING.x
              )}
              ref={pills}
            >
              {calendars.map((c) => {
                const active = c.id === calendar?.id;
                return (
                  <button
                    aria-pressed={active}
                    className={cn(PILL, PILL_ON_GROUND)}
                    key={c.id}
                    onClick={() => {
                      if (!active) go(c.id, null);
                    }}
                    type="button"
                  >
                    <span
                      className="h-3 w-3 rounded-full border-2 border-current"
                      style={{ background: hexOf(colorOf(boop, c)) }}
                    />
                    {c.name}
                    {c.members.length > 1 && (
                      <span
                        className={cn(
                          "text-xs",
                          active ? "text-ink/70" : "text-muted"
                        )}
                      >
                        · {c.members.length}
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                className={cn(PILL, "scribble-dashed scribble-clear")}
                onClick={() => setDialog("new")}
                type="button"
              >
                + {t.app.newCalendar}
              </button>
            </nav>

            {!calendar && (
              // Every calendar may go, the last one too – then this.
              <div className="flex flex-col items-start gap-3 py-10">
                <p className="font-bold text-muted">{t.app.noCalendar}</p>
                <Button onClick={() => setDialog("new")}>
                  + {t.app.newCalendar}
                </Button>
              </div>
            )}

            {calendar && (
              // The calendar's page: a sheet of paper in a pale shade of its
              // color, cut out by hand – no line around it, the month's ruled
              // table or today's page is the drawing. On a phone it reaches
              // into the gutter, so the days stay as large as they were.
              // Another calendar is another sheet: it comes anew, its days
              // and prints with it.
              <div
                className="relative isolate -mx-3 animate-fade px-3 py-4 sm:mx-0 sm:p-6"
                key={calendar.id}
                style={PAPER as CSSProperties}
              >
                {/* The paper itself – beside what lies on it, not around it:
                  what a frame is told (no line, here) its children hear too. */}
                <span
                  aria-hidden="true"
                  className="scribble scribble-bare pointer-events-none absolute inset-0 -z-10 rounded-[28px]"
                />
                <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-3">
                  <h2 className="wrap-break-word min-w-0 flex-1 text-2xl">
                    <Marked>{calendar.name}</Marked>
                  </h2>
                  {/* The views: beside the name – on a phone in a line of
                    their own, under it. */}
                  <div className="max-sm:order-last max-sm:w-full">
                    <ViewSwitch locale={locale} onPick={pick} view={view} />
                  </div>
                  {/* Sharing is the owner's – the server lets no one else. */}
                  {owner && (
                    <NameTag id="share" text={t.app.share.title}>
                      {({ onClick, ...anchor }) => (
                        <button
                          {...anchor}
                          aria-label={t.app.share.title}
                          className={ROUND_BUTTON}
                          onClick={() => {
                            onClick();
                            stepTo({ panel: "share" });
                            setSharing(calendar.id);
                          }}
                          type="button"
                        >
                          <PersonPlus className="h-6 w-6" />
                        </button>
                      )}
                    </NameTag>
                  )}
                  <NameTag id="settings" text={t.app.settings.title}>
                    {({ onClick, ...anchor }) => (
                      <button
                        {...anchor}
                        aria-label={t.app.settings.title}
                        className={ROUND_BUTTON}
                        onClick={() => {
                          onClick();
                          stepTo({ panel: "settings" });
                          setSettings(calendar.id);
                        }}
                        type="button"
                      >
                        <Sliders className="h-6 w-6" />
                      </button>
                    )}
                  </NameTag>
                </div>
                <AnimatePresence initial={false} mode="wait">
                  <m.div
                    animate="shown"
                    exit="gone"
                    initial="hidden"
                    key={view}
                    variants={VIEW_TURN}
                  >
                    {view === "today" && (
                      <TodayView
                        calendar={calendar.id}
                        keyboard={!(covered || inviting)}
                        locale={locale}
                        stamps={myStamps}
                      />
                    )}
                    {view === "month" && (
                      <MonthGrid
                        calendar={calendar.id}
                        locale={locale}
                        month={month}
                        onDay={openDayAt}
                        onMonth={setMonth}
                      />
                    )}
                    {view === "year" && (
                      // The year of the month that shows – one place in
                      // time for both: a year picked here, the month opens
                      // in it.
                      <YearGrid
                        calendar={calendar.id}
                        locale={locale}
                        onDay={openDayAt}
                        onMonth={(at) => {
                          setMonth(at);
                          pick("month");
                        }}
                        onYear={(year) =>
                          setMonth({ year, month: month.month })
                        }
                        year={month.year}
                      />
                    )}
                  </m.div>
                </AnimatePresence>
              </div>
            )}
          </div>

          <section className="flex flex-col gap-4 lg:sticky lg:top-6">
            <div>
              <h2 className="text-3xl">{t.app.stamps}</h2>
              {/* The wave swings below its picture's edge (its troughs reach
                past the viewBox, doodles.tsx) – so the picture may not cut
                it off. */}
              <Squiggle className="h-3 w-24" />
            </div>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-3">
              <li>
                <button
                  className="scribble scribble-dashed group flex aspect-square w-full flex-col items-center justify-center gap-1.5 text-balance rounded-3xl px-2 text-center font-bold text-[13px] leading-tight transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scribble-boil active:translate-y-px active:scale-[0.97]"
                  onClick={() => {
                    stepTo({ panel: "draw" });
                    setDrawing(true);
                  }}
                  type="button"
                >
                  <span className="scribble scribble-sm scribble-ink flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-200 group-hover:rotate-90">
                    <Plus className="h-5 w-5" />
                  </span>
                  {t.app.newStamp}
                </button>
              </li>
              {myStamps.map((s) => (
                <li
                  className="relative"
                  key={s.id}
                  style={{ transform: `rotate(${tilt(s.id)}deg)` }}
                >
                  <NameTag
                    id={s.id}
                    text={[s.name, whose(s)].filter(Boolean).join(" – ")}
                  >
                    {({ onClick, ...anchor }) => (
                      <button
                        {...anchor}
                        aria-label={[s.name || t.app.stamp.untitled, whose(s)]
                          .filter(Boolean)
                          .join(" – ")}
                        className="scribble scribble-bare flex aspect-square w-full items-center justify-center rounded-3xl p-1 hover:animate-wiggle hover:scribble-soft"
                        onClick={() => {
                          onClick();
                          setOpened(s.id);
                        }}
                        type="button"
                      >
                        <Sticker stamp={s} />
                      </button>
                    )}
                  </NameTag>
                  {s.drawing?.special && (
                    // A stamp for the big days.
                    <Sparkle className="pointer-events-none absolute top-1 right-1 h-4 w-4 text-ink" />
                  )}
                  {s.owner !== me ? (
                    <span className="pointer-events-none absolute right-0 bottom-0 flex max-w-full">
                      <span className={cn(BADGE, "min-w-0")}>
                        <span className="truncate">{nameOf(s.owner)}</span>
                      </span>
                    </span>
                  ) : (
                    s.sharedWith.length > 0 && (
                      <SharedSign className="pointer-events-none absolute right-1 bottom-1 h-4 w-4" />
                    )
                  )}
                </li>
              ))}
            </ul>
            {myStamps.length === 0 && (
              <p className="font-medium text-muted">{t.app.noStamps}</p>
            )}
          </section>
        </div>

        <SiteFooter
          className="mt-auto px-0 pt-4 sm:px-0"
          locale={locale}
          owner={SITE_DEFAULTS.address.name}
          website={SITE_DEFAULTS.links.website}
        />
      </div>

      {/* Each sheet in its own presence – there it can go the way it came. */}
      <AnimatePresence>
        {calendar && openDay && (
          <DaySheet
            calendar={calendar.id}
            date={openDay}
            key="day"
            locale={locale}
            onClose={closeStep(() => setDay(null))}
            stamps={myStamps}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {drawing && (
          <StampDrawer
            ask={askLeave}
            calendar={
              calendar && calendar.members.length > 1 ? calendar.id : null
            }
            key="drawer"
            locale={locale}
            onClose={closeStep(() => setDrawing(false))}
            onDrawn={noteDrawn}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {dialog === "new" && (
          <CalendarSheet
            // New calendars take turns with the stamp colors (palette.ts) –
            // past the ones the account sees its calendars in.
            color={nextKey(calendars.map((c) => colorOf(boop, c)))}
            key="new"
            locale={locale}
            onClose={() => setDialog(null)}
            onSave={(name, color) => void onNewCalendar(name, color)}
            submit={t.app.create}
            title={t.app.newCalendar}
          />
        )}
      </AnimatePresence>
      <AnimatePresence
        onExitComplete={() => {
          // The settings are gone – now the share sheet they asked for.
          if (!shareNext.current) return;
          setSharing(shareNext.current);
          shareNext.current = null;
        }}
      >
        {settings && boop.calendars[settings] && (
          <CalendarSettings
            calendar={boop.calendars[settings]}
            key="settings"
            locale={locale}
            onClose={closeStep(() => setSettings(null))}
            onDeleted={() => {
              setSettings(null);
              setShown({ calendar: null, view: null, day: null, panel: null });
            }}
            onShare={() => {
              shareNext.current = settings;
              setSettings(null);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {account && (
          <AccountSheet
            key="account"
            locale={locale}
            onClose={closeStep(() => setAccount(false))}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {dialog === "logout" && (
          <ConfirmSheet
            confirm={t.app.logout}
            key="logout"
            locale={locale}
            onClose={() => setDialog(null)}
            onConfirm={() => void doLogout()}
            title={t.app.logout}
          >
            {t.app.logoutPending(boop.pending)}
          </ConfirmSheet>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {opened && boop.stamps[opened] && (
          <StampSheet
            key="stamp"
            locale={locale}
            mine={boop.stamps[opened].owner === me}
            onClose={() => setOpened(null)}
            stamp={boop.stamps[opened]}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {sharing && boop.calendars[sharing] && (
          <ShareSheet
            calendar={boop.calendars[sharing]}
            key="share"
            locale={locale}
            onClose={closeStep(() => setSharing(null))}
          />
        )}
      </AnimatePresence>
      {/* An invitation waiting – once nothing else lies over the app; a
          yes shows the calendar. */}
      <Invitations
        hold={covered}
        locale={locale}
        onJoined={(id) => go(id, null)}
        onShowing={setInviting}
      />
    </div>
  );
};

/**
 * Words marked with the highlighter – in the calendar's color (`--cal-mark`,
 * always light enough for ink on it). The stroke lies a little askew behind
 * them, as drawn by hand.
 */
const Marked = ({ children }: { children: ReactNode }) => (
  <span className="relative isolate -mx-1.5 inline-block max-w-full px-1.5">
    <span
      aria-hidden="true"
      className="scribble scribble-bare scribble-sm absolute inset-x-0 inset-y-0.5 -z-10 -rotate-1 rounded-lg [--scribble-fill:var(--cal-mark)]"
    />
    {children}
  </span>
);

/** Two rings, one over the other – a stamp of mine that others may use too. */
const SharedSign = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeWidth="2.4"
    viewBox="0 0 24 24"
  >
    <circle cx="8.5" cy="12" r="5.5" />
    <circle cx="15.5" cy="12" r="5.5" />
  </svg>
);

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
    {children}
  </div>
);
