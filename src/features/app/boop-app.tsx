"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Squiggle, Ticks } from "@/components/doodles";
import { SiteFooter } from "@/components/site-footer";
import {
  BADGE,
  Button,
  Logo,
  Notice,
  PILL,
  ROUND_BUTTON,
} from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import {
  COLORS,
  type ColorName,
  type DayKey,
  stampsOf,
} from "@/features/calendar/model";
import {
  createCalendar,
  deleteCalendar,
  logout,
  renameCalendar,
  start,
  useBoop,
} from "@/features/offline/store";
import { SITE_DEFAULTS } from "@/features/site/defaults";
import { Sticker } from "@/features/stickers/sticker";
import { Link, useTransitionRouter } from "@/features/transitions/link";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { DaySheet } from "./day-sheet";
import { CalendarSheet, ConfirmSheet } from "./dialogs";
import { MonthGrid } from "./month-grid";
import { ShareSheet } from "./share-sheet";
import { StampDrawer } from "./stamp-drawer";
import { StampSheet } from "./stamp-sheet";
import { SyncBadge } from "./sync-badge";

/** New calendars take turns with these colors. */
const NEW_COLORS: ColorName[] = [
  "sky",
  "pink",
  "mint",
  "sun",
  "coral",
  "grape",
];

/** A stable little tilt per stamp – the shelf looks hand-placed. */
const tilt = (id: string) => ((id.charCodeAt(0) + id.charCodeAt(5)) % 9) - 4;

/**
 * The calendar in the address – /de/app/{id} – or null. Only the browser
 * knows it: the server's page is the same for every calendar.
 */
const calendarInAddress = () => {
  if (typeof window === "undefined") return null;
  const [, , app, id] = window.location.pathname.split("/");
  return (app === "app" && id) || null;
};

/**
 * The app: the account's calendars, a month of the chosen one, a day to
 * stamp on, the 3D stamps. Everything reads the device's copy
 * (offline/store.ts) – it works the same without a connection.
 */
export const BoopApp = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const boop = useBoop();
  const router = useTransitionRouter();
  // The chosen calendar lives in the address, so a reload stays on it. The
  // server renders none (null) – no matter: until the device's copy is open
  // (status "loading", always so while hydrating) no calendar shows.
  const [calendarId, setCalendarId] = useState(calendarInAddress);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [day, setDay] = useState<DayKey | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    "new" | "rename" | "delete" | "logout" | null
  >(null);

  useEffect(() => {
    void start();
  }, []);

  useEffect(() => {
    if (boop.status === "signedOut") router.replace(`/${locale}/login`);
  }, [boop.status, locale, router]);

  const calendars = useMemo(
    () =>
      Object.values(boop.calendars).sort(
        (a, b) =>
          Number(b.personal) - Number(a.personal) ||
          a.name.localeCompare(b.name)
      ),
    [boop.calendars]
  );
  const calendar =
    calendars.find((c) => c.id === calendarId) ?? calendars[0] ?? null;
  const me = boop.me?.id;
  // The same in every calendar: mine, then what others share with me.
  const myStamps = useMemo(
    () =>
      stampsOf(Object.values(boop.stamps), me, Object.keys(boop.calendars)),
    [boop.stamps, boop.calendars, me]
  );
  // On the shelf someone else's stamp wears their first name – and one of
  // mine that others may use too, two rings.
  const nameOf = (id: string) => boop.people[id]?.split(" ")[0] || "?";
  const whose = (s: { owner: string; sharedWith: readonly string[] }) => {
    if (s.owner !== me) return t.app.stamp.by(nameOf(s.owner));
    return s.sharedWith.length > 0 ? t.app.stamp.shared : "";
  };

  // Whichever calendar shows goes into the address – chosen, new, or the
  // first when the address names none (or one that is gone). By id: names
  // repeat and change. Next keeps its own history state and learns the new
  // path (usePathname) – hence null, not the current state.
  const shown = calendar?.id;
  useEffect(() => {
    if (!shown) return;
    const path = `/${locale}/app/${shown}`;
    const { pathname, search, hash } = window.location;
    if (pathname !== path) {
      window.history.replaceState(null, "", `${path}${search}${hash}`);
    }
  }, [locale, shown]);

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

  const onNewCalendar = async (name: string, color: ColorName) => {
    setCalendarId(await createCalendar(name, color));
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

  return (
    // The same frame as the public pages – width, header, logo – so nothing
    // jumps when changing between them.
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 sm:px-6">
      <header className="flex items-center justify-between gap-4 py-5">
        <Link aria-label={t.nav.home} href={`/${locale}`}>
          <Logo className="text-[32px]" />
        </Link>
        <div className="relative flex items-center gap-2">
          <SyncBadge locale={locale} />
          <button
            aria-expanded={menu}
            aria-label={t.app.account}
            className={cn(ROUND_BUTTON, "aria-expanded:scribble-ink")}
            onClick={() => setMenu(!menu)}
            type="button"
          >
            {firstName.slice(0, 1).toUpperCase() || "?"}
          </button>
          {menu && (
            <div className="scribble absolute top-13 right-0 z-40 flex w-60 animate-rise flex-col gap-3 rounded-3xl p-4">
              <div>
                <p className="font-black">{boop.me?.name}</p>
                <p className="truncate text-muted text-sm">{boop.me?.email}</p>
              </div>
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
            </div>
          )}
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
          {/* On phones a row to swipe, edge to edge – a scroller cuts off
              all round, so it pads (and margins back) room for the pills'
              wobble, lift and focus ring. Wider, they wrap: nothing cut. */}
          <nav
            aria-label={t.app.calendars}
            className="-mx-4 -my-3 flex gap-2.5 overflow-x-auto px-4 py-3 sm:m-0 sm:flex-wrap sm:overflow-visible sm:p-0"
          >
            {calendars.map((c) => {
              const active = c.id === calendar?.id;
              return (
                <button
                  aria-pressed={active}
                  className={PILL}
                  key={c.id}
                  onClick={() => setCalendarId(c.id)}
                  type="button"
                >
                  <span
                    className="h-3 w-3 rounded-full border-2 border-current"
                    style={{ background: COLORS[c.color] }}
                  />
                  {c.name}
                  {c.members.length > 1 && (
                    <span
                      className={cn(
                        "text-xs",
                        active ? "text-card/70" : "text-muted"
                      )}
                    >
                      · {c.members.length}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              className={cn(PILL, "scribble-dashed")}
              onClick={() => setDialog("new")}
              type="button"
            >
              + {t.app.newCalendar}
            </button>
          </nav>

          {calendar && (
            <div className="scribble rounded-[32px] p-4 sm:p-6">
              <MonthGrid
                calendar={calendar.id}
                locale={locale}
                month={month}
                onDay={(key) => {
                  setDay(key);
                  trackEvent("day-opened");
                }}
                onMonth={setMonth}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={() => setSharing(true)}
                  size="sm"
                  variant="plain"
                >
                  {t.app.share.title}
                </Button>
                {owner && !calendar.personal && (
                  <>
                    <Button
                      onClick={() => setDialog("rename")}
                      size="sm"
                      variant="ghost"
                    >
                      {t.app.rename}
                    </Button>
                    <Button
                      onClick={() => setDialog("delete")}
                      size="sm"
                      variant="ghost"
                    >
                      {t.app.deleteCalendar}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <section className="flex flex-col gap-4 lg:sticky lg:top-6">
          <div>
            <h2 className="text-3xl">{t.app.stamps}</h2>
            <Squiggle className="h-3 w-24" />
          </div>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-3">
            <li>
              <button
                className="scribble scribble-dashed group flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-3xl font-bold text-sm leading-tight transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scribble-boil active:translate-y-px active:scale-[0.97]"
                onClick={() => setDrawing(true)}
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
                title={[s.name, whose(s)].filter(Boolean).join(" – ") || undefined}
              >
                <button
                  aria-label={[s.name || t.app.stamp.untitled, whose(s)]
                    .filter(Boolean)
                    .join(" – ")}
                  className="scribble scribble-bare scribble-clear flex aspect-square w-full items-center justify-center rounded-3xl p-1 hover:animate-wiggle hover:scribble-soft"
                  onClick={() => setOpened(s.id)}
                  type="button"
                >
                  <Sticker stamp={s} />
                </button>
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

      {calendar && day && (
        <DaySheet
          calendar={calendar.id}
          date={day}
          locale={locale}
          onClose={() => setDay(null)}
          stamps={myStamps}
        />
      )}
      {drawing && (
        <StampDrawer
          calendar={calendar && !calendar.personal ? calendar.id : null}
          locale={locale}
          onClose={() => setDrawing(false)}
        />
      )}
      {dialog === "new" && (
        <CalendarSheet
          color={NEW_COLORS[calendars.length % NEW_COLORS.length]}
          locale={locale}
          onClose={() => setDialog(null)}
          onSave={(name, color) => void onNewCalendar(name, color)}
          submit={t.app.create}
          title={t.app.newCalendar}
        />
      )}
      {dialog === "rename" && calendar && (
        <CalendarSheet
          color={calendar.color}
          locale={locale}
          name={calendar.name}
          onClose={() => setDialog(null)}
          onSave={(name, color) =>
            void renameCalendar(calendar.id, name, color)
          }
          submit={t.app.draw.save}
          title={t.app.rename}
        />
      )}
      {dialog === "delete" && calendar && (
        <ConfirmSheet
          confirm={t.app.deleteCalendar}
          locale={locale}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            void deleteCalendar(calendar.id);
            setCalendarId(null);
          }}
          title={t.app.deleteCalendar}
        >
          {t.app.deleteCalendarConfirm(calendar.name)}
        </ConfirmSheet>
      )}
      {dialog === "logout" && (
        <ConfirmSheet
          confirm={t.app.logout}
          locale={locale}
          onClose={() => setDialog(null)}
          onConfirm={() => void doLogout()}
          title={t.app.logout}
        >
          {t.app.logoutPending(boop.pending)}
        </ConfirmSheet>
      )}
      {opened && boop.stamps[opened] && (
        <StampSheet
          locale={locale}
          mine={boop.stamps[opened].owner === me}
          onClose={() => setOpened(null)}
          stamp={boop.stamps[opened]}
        />
      )}
      {calendar && sharing && (
        <ShareSheet
          calendar={calendar}
          locale={locale}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
};

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
