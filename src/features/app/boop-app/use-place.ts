"use client";

import { useMemo, useState } from "react";
import { trackEvent } from "@/features/analytics/client";
import type { DayKey } from "@/features/calendar/model";
import {
  type CalendarView,
  prefOf,
  type useBoop,
} from "@/features/offline/store";
import { LOCALES, type Locale } from "@/i18n/config";
import {
  type Address,
  addressOf,
  calendarOf,
  NOTHING,
  type Open,
  shelfAddressOf,
  slugsOf,
  viewShown,
} from "../address";
import { asked, HELD, monthOf, stepped } from "./history";

/**
 * Where the app is: the calendar showing and its view, a day open over it,
 * the month the month and the year show – or the shelf – and the ways from
 * one to the next, each a step in the browser's history (history.ts).
 */
export const usePlace = ({
  boop,
  locale,
  settle,
}: {
  boop: ReturnType<typeof useBoop>;
  locale: Locale;
  /** The shelf's moment moves on (`useShelf`) – it comes up, or goes. */
  settle: () => void;
}) => {
  // The page, the calendar and the view showing live in the address, so a
  // reload stays on them, and a link opens them. The calendar: its id once
  // found, before that what the address named (a slug, or an id). The view:
  // null for the one the calendar opens in (`viewShown`) – once it shows,
  // held too. On the shelf (`shown.shelf`) both stay as they were: its
  // color, and the way back. The server renders none – no matter: until the
  // device's copy is open (status "loading", always so while hydrating)
  // nothing shows.
  const [shown, setShown] = useState(asked);
  // A day open in the month or the year – in the address too, so a reload
  // or a link opens it again, in its month.
  const [day, setDay] = useState<DayKey | null>(shown.day);
  const [month, setMonth] = useState(() => {
    if (shown.day) return monthOf(shown.day);
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

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
  // The view the address asks for – else the one the calendar opens in
  // (its settings), else the month.
  const view = viewShown(
    shown.view,
    calendar && prefOf(boop, calendar.id).start
  );
  // Found, it is held by its id: renamed, it stays. And in the view it
  // opened in: a start view picked meanwhile is for the next time.
  if (calendar && (shown.calendar !== calendar.id || shown.view !== view)) {
    setShown({ ...shown, calendar: calendar.id, view });
  }
  // The today view is a day of its own – none opens over it; nor over the
  // shelf.
  const openDay = shown.shelf || view === "today" ? null : day;
  const shownId = calendar?.id;
  const slug = shownId && slugs[locale].get(shownId);

  /**
   * Shows a calendar – in `next` view, or the one it opens in – as a step
   * of its own: back goes to what showed before. None (every calendar
   * gone): the calendars' page, with what it says then.
   */
  const go = (id: string | null, next: CalendarView | null) => {
    const shows = viewShown(next, id ? prefOf(boop, id).start : null);
    const path = addressOf(locale, id && slugs[locale].get(id), shows);
    const { pathname, search, hash } = window.location;
    if (pathname !== path) {
      window.history.pushState(
        { [HELD]: { calendar: id, view: shows } },
        "",
        `${path}${search}${hash}`
      );
    }
    setShown({ ...NOTHING, calendar: id, view: next });
    setDay(null);
  };

  /**
   * The shelf, as a step of its own: back goes to what showed before. A
   * day's sheet open over the view closes on the way – its step becomes the
   * shelf's (one that came with the address goes from it first): back is
   * the view, without it.
   */
  const toShelf = () => {
    if (shown.shelf) return;
    const entry = { [HELD]: { calendar: shownId, view } };
    const { search, hash } = window.location;
    const path = `${shelfAddressOf(locale)}${search}${hash}`;
    if (openDay && stepped()) {
      window.history.replaceState(entry, "", path);
    } else {
      if (openDay) {
        window.history.replaceState(
          entry,
          "",
          `${addressOf(locale, slug, view)}${search}${hash}`
        );
      }
      window.history.pushState(entry, "", path);
    }
    setShown({ ...shown, shelf: true, day: null, panel: null });
    setDay(null);
    settle();
  };

  /** Back from the shelf: the calendar shown before, in its view. */
  const toCalendars = () => {
    go(calendar?.id ?? null, view);
    settle();
  };

  /**
   * The other view – in the address only: the calendar still opens in its
   * own (its settings, `start`).
   */
  const pick = (next: CalendarView) => {
    if (!calendar || next === view) return;
    go(calendar.id, next);
  };

  /**
   * A day or a sheet opens over the view, or over the shelf – a step of its
   * own in the history: back closes it, and closing it goes back
   * (`closeStep`). The entry keeps what the address doesn't say (`keep`):
   * the stamp drawn anew.
   */
  const stepTo = (open: Open, keep?: { stamp: string }) => {
    const path = shown.shelf
      ? shelfAddressOf(locale, open.panel)
      : addressOf(locale, slug, view, open);
    const { search, hash } = window.location;
    window.history.pushState(
      { [HELD]: { calendar: shownId, view, stepped: true, ...keep } },
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
    if (stepped()) window.history.back();
    else close();
  };

  /** A day's sheet, from the month or the year. */
  const openDayAt = (key: DayKey) => {
    stepTo({ day: key });
    setDay(key);
    trackEvent("day-opened");
  };

  /**
   * Back or forth in the history: what that entry showed – a day open in
   * it too, in its month.
   */
  const showAsked = (next: Address) => {
    setShown(next);
    setDay(next.day);
    if (next.day) setMonth(monthOf(next.day));
  };

  return {
    shown,
    setShown,
    setDay,
    month,
    setMonth,
    calendars,
    slugs,
    calendar,
    view,
    openDay,
    shownId,
    slug,
    go,
    toShelf,
    toCalendars,
    pick,
    stepTo,
    closeStep,
    openDayAt,
    showAsked,
  };
};

export type Place = ReturnType<typeof usePlace>;
