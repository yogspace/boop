"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkle, Squiggle } from "@/components/doodles";
import { Button, Logo, Notice } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import { COLORS, type DayKey } from "@/features/calendar/model";
import { legalPath } from "@/features/legal/links";
import {
  createCalendar,
  deleteCalendar,
  logout,
  renameCalendar,
  start,
  useBoop,
} from "@/features/offline/store";
import { Sticker } from "@/features/stickers/sticker";
import { Link, useTransitionRouter } from "@/features/transitions/link";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { DaySheet } from "./day-sheet";
import { MonthGrid } from "./month-grid";
import { ShareSheet } from "./share-sheet";
import { StampDrawer } from "./stamp-drawer";
import { SyncBadge } from "./sync-badge";

/** A stable little tilt per stamp – the shelf looks hand-placed. */
const tilt = (id: string) => ((id.charCodeAt(0) + id.charCodeAt(5)) % 9) - 4;

/**
 * The app: the account's calendars, a month of the chosen one, a day to
 * stamp on, the 3D stamps. Everything reads the device's copy
 * (offline/store.ts) – it works the same without a connection.
 */
export const BoopApp = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const boop = useBoop();
  const router = useTransitionRouter();
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [day, setDay] = useState<DayKey | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [menu, setMenu] = useState(false);

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
  const myStamps = useMemo(
    () =>
      Object.values(boop.stamps).filter(
        (s) =>
          (s.owner === me && !s.calendar) ||
          (calendar && s.calendar === calendar.id)
      ),
    [boop.stamps, me, calendar]
  );

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

  const onNewCalendar = async () => {
    const name = window.prompt(t.app.newCalendarName)?.trim();
    if (!name) return;
    const colors = ["sky", "pink", "mint", "sun", "coral", "grape"] as const;
    setCalendarId(
      await createCalendar(
        name.slice(0, 60),
        colors[calendars.length % colors.length]
      )
    );
    trackEvent("calendar-created");
  };

  const onLogout = async () => {
    if (!navigator.onLine) {
      window.alert(t.app.logoutOffline);
      return;
    }
    if (boop.pending && !window.confirm(t.app.logoutPending(boop.pending))) {
      return;
    }
    if (await logout()) {
      trackEvent("logout");
      router.replace(`/${locale}`);
    }
  };

  const owner = calendar && calendar.owner === me;
  const firstName = boop.me?.name.split(" ")[0] ?? "";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-10 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Link aria-label={t.nav.home} href={`/${locale}`}>
          <Logo />
        </Link>
        <div className="relative flex items-center gap-2">
          <SyncBadge locale={locale} />
          <button
            aria-expanded={menu}
            aria-label={t.app.account}
            className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink bg-pink font-black text-white shadow-sticker-sm transition active:shadow-none"
            onClick={() => setMenu(!menu)}
            type="button"
          >
            {firstName.slice(0, 1).toUpperCase() || "?"}
          </button>
          {menu && (
            <div className="absolute top-12 right-0 z-40 flex w-60 animate-rise flex-col gap-3 rounded-3xl border-2 border-ink bg-card p-4 shadow-sticker">
              <div>
                <p className="font-black">{boop.me?.name}</p>
                <p className="truncate text-muted text-sm">{boop.me?.email}</p>
              </div>
              <Button onClick={onLogout} size="sm" variant="plain">
                {t.app.logout}
              </Button>
            </div>
          )}
        </div>
      </header>

      <section className="animate-rise">
        <h1 className="text-4xl sm:text-5xl">
          {t.app.hello(firstName)}{" "}
          <Sparkle className="inline h-8 w-8 animate-wiggle text-sun" />
        </h1>
        <p className="mt-1 font-medium text-muted">{t.app.lead}</p>
      </section>

      <nav
        aria-label={t.app.calendars}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {calendars.map((c) => {
          const active = c.id === calendar?.id;
          return (
            <button
              aria-pressed={active}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border-2 border-ink px-4 py-2 font-bold text-sm transition",
                active
                  ? "bg-ink text-white shadow-sticker-sm"
                  : "bg-card hover:-translate-y-0.5"
              )}
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
                    active ? "text-white/70" : "text-muted"
                  )}
                >
                  · {c.members.length}
                </span>
              )}
            </button>
          );
        })}
        <button
          className="shrink-0 rounded-full border-2 border-ink border-dashed px-4 py-2 font-bold text-sm transition hover:bg-card"
          onClick={onNewCalendar}
          type="button"
        >
          + {t.app.newCalendar}
        </button>
      </nav>

      {calendar && (
        <div className="animate-rise rounded-[32px] border-2 border-ink bg-card p-4 shadow-sticker sm:p-6">
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
            <Button onClick={() => setSharing(true)} size="sm" variant="plain">
              {t.app.share.title}
            </Button>
            {owner && !calendar.personal && (
              <>
                <Button
                  onClick={() => {
                    const name = window
                      .prompt(t.app.newCalendarName, calendar.name)
                      ?.trim();
                    if (name) {
                      void renameCalendar(calendar.id, name.slice(0, 60));
                    }
                  }}
                  size="sm"
                  variant="ghost"
                >
                  {t.app.rename}
                </Button>
                <Button
                  onClick={() => {
                    if (
                      window.confirm(t.app.deleteCalendarConfirm(calendar.name))
                    ) {
                      void deleteCalendar(calendar.id);
                      setCalendarId(null);
                    }
                  }}
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

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-3xl">{t.app.stamps}</h2>
          <Squiggle className="h-3 w-24 text-pink" />
        </div>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          <li>
            <button
              className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-3xl border-2 border-ink border-dashed bg-card/60 font-bold text-sm transition hover:-translate-y-1 hover:bg-violet-soft"
              onClick={() => setDrawing(true)}
              type="button"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink bg-violet font-black text-white text-xl">
                +
              </span>
              {t.app.newStamp}
            </button>
          </li>
          {myStamps.map((s) => (
            <li
              className="animate-boop"
              key={s.id}
              style={{ transform: `rotate(${tilt(s.id)}deg)` }}
              title={s.name || undefined}
            >
              <div className="flex aspect-square items-center justify-center rounded-3xl border-2 border-ink bg-card p-1 shadow-sticker-sm transition hover:animate-wiggle">
                <Sticker label={s.name || undefined} stamp={s} />
              </div>
            </li>
          ))}
        </ul>
        {myStamps.length === 0 && (
          <p className="font-medium text-muted">{t.app.noStamps}</p>
        )}
      </section>

      <footer className="mt-auto pt-6 text-center text-muted text-sm">
        <Link className="underline underline-offset-4" href={legalPath(locale)}>
          {t.nav.legal}
        </Link>
      </footer>

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

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
    {children}
  </div>
);
