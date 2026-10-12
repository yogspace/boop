"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Notice } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import type { DayKey } from "@/features/calendar/model";
import { StampSvg } from "@/features/calendar/stamp-svg";
import { legalPath } from "@/features/legal/links";
import {
  createCalendar,
  deleteCalendar,
  logout,
  renameCalendar,
  start,
  useBoop,
} from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { DaySheet } from "./day-sheet";
import { MonthGrid } from "./month-grid";
import { ShareSheet } from "./share-sheet";
import { StampDrawer } from "./stamp-drawer";
import { SyncBadge } from "./sync-badge";

/**
 * The app: the account's calendars, a month of the chosen one, a day to
 * stamp on, the own stamps. Everything reads the device's copy
 * (offline/store.ts) – it works the same without a connection.
 */
export const BoopApp = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const boop = useBoop();
  const router = useRouter();
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [day, setDay] = useState<DayKey | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [sharing, setSharing] = useState(false);

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
    return <Centered>{t.app.loading}</Centered>;
  }
  if (boop.status === "offlineNoAccount") {
    return (
      <Centered>
        <Notice>{t.app.offlineNoAccount}</Notice>
      </Centered>
    );
  }

  const onNewCalendar = async () => {
    const name = window.prompt(t.app.newCalendarName)?.trim();
    if (!name) return;
    setCalendarId(await createCalendar(name.slice(0, 60), "sky"));
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

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link className="font-doodle font-bold text-3xl" href={`/${locale}`}>
          boop<span className="text-coral">.</span>
        </Link>
        <div className="flex items-center gap-3">
          <SyncBadge locale={locale} />
          <span className="hidden text-muted text-sm sm:inline">
            {boop.me?.name}
          </span>
          <Button
            className="px-3 py-1.5 text-sm"
            onClick={onLogout}
            variant="plain"
          >
            {t.app.logout}
          </Button>
        </div>
      </header>

      <nav aria-label={t.app.calendars} className="flex flex-wrap gap-2">
        {calendars.map((c) => (
          <button
            className={cn(
              "rounded-full border-2 border-ink px-4 py-1.5 font-bold text-sm",
              c.id === calendar?.id ? "bg-sun shadow-sticker-sm" : "bg-card"
            )}
            key={c.id}
            onClick={() => setCalendarId(c.id)}
            type="button"
          >
            {c.name}
            {c.members.length > 1 && ` · ${c.members.length}`}
          </button>
        ))}
        <button
          className="rounded-full border-2 border-ink border-dashed px-4 py-1.5 font-bold text-sm"
          onClick={onNewCalendar}
          type="button"
        >
          + {t.app.newCalendar}
        </button>
      </nav>

      {calendar && (
        <Card className="p-4 sm:p-6">
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
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <Button
              className="px-3 py-1.5 text-sm"
              onClick={() => setSharing(true)}
              variant="plain"
            >
              {t.app.share.title}
            </Button>
            {owner && !calendar.personal && (
              <>
                <Button
                  className="px-3 py-1.5 text-sm"
                  onClick={() => {
                    const name = window
                      .prompt(t.app.newCalendarName, calendar.name)
                      ?.trim();
                    if (name)
                      void renameCalendar(calendar.id, name.slice(0, 60));
                  }}
                  variant="plain"
                >
                  {t.app.rename}
                </Button>
                <Button
                  className="px-3 py-1.5 text-sm"
                  onClick={() => {
                    if (
                      window.confirm(t.app.deleteCalendarConfirm(calendar.name))
                    ) {
                      void deleteCalendar(calendar.id);
                      setCalendarId(null);
                    }
                  }}
                  variant="plain"
                >
                  {t.app.deleteCalendar}
                </Button>
              </>
            )}
          </div>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-doodle font-bold text-2xl">{t.app.stamps}</h2>
          <Button onClick={() => setDrawing(true)}>+ {t.app.newStamp}</Button>
        </div>
        {myStamps.length === 0 ? (
          <p className="text-muted">{t.app.noStamps}</p>
        ) : (
          <ul className="grid grid-cols-4 gap-3 sm:grid-cols-6">
            {myStamps.map((s) => (
              <li
                className="flex aspect-square items-center justify-center rounded-2xl border-2 border-ink bg-card p-2"
                key={s.id}
                title={s.name || undefined}
              >
                <StampSvg
                  className="h-full w-full"
                  color={s.color}
                  drawing={s.drawing}
                  shape={s.shape}
                  title={s.name || undefined}
                />
              </li>
            ))}
          </ul>
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
  <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
    {children}
  </div>
);
