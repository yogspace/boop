"use client";

import { useEffect, useEffectEvent } from "react";
import type { DayKey } from "@/features/calendar/model";
import { isCalendarView } from "@/features/calendar/prefs";
import type { CalendarView } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import {
  type Address,
  addressOf,
  NOTHING,
  type Panel,
  readAddress,
  shelfAddressOf,
} from "../address";

/**
 * The app's address in the browser's history: what an entry keeps besides
 * the path, what the address asks for when the app opens or the history
 * moves, and the path kept right as the app changes (address.ts says what
 * the paths are).
 */

/**
 * Where a history entry of the app keeps the calendar it showed – by its
 * id, so a reload or the back button finds it even when its name (and so
 * its address) has changed meanwhile – and its view. On the shelf the
 * address names neither: the entry keeps the calendar shown before, whose
 * color the page stays in, and to which the way back leads.
 */
export const HELD = "boop";

/**
 * What the address asks for (address.ts) – only the browser knows: the
 * server's page is the same for every calendar. The calendar is the one the
 * history entry kept, where it kept one, else the one the address names;
 * the view the address's, else (on the shelf) the entry's.
 */
export const asked = (): Address => {
  if (typeof window === "undefined") return { ...NOTHING };
  const address = readAddress(window.location.pathname);
  const held = window.history.state?.[HELD];
  const calendar: unknown = held?.calendar;
  const view: unknown = held?.view;
  return {
    ...address,
    calendar: typeof calendar === "string" ? calendar : address.calendar,
    view: address.view ?? (isCalendarView(view) ? view : null),
  };
};

/**
 * The stamp the history entry keeps for the editor (the `edit` sheet) – the
 * address says only that one is open, not which.
 */
export const heldStamp = (): string | null => {
  if (typeof window === "undefined") return null;
  const held: unknown = window.history.state?.[HELD]?.stamp;
  return typeof held === "string" ? held : null;
};

/** The month a day is in – where the month and the year open with it. */
export const monthOf = (day: DayKey) => ({
  year: Number(day.slice(0, 4)),
  month: Number(day.slice(5, 7)) - 1,
});

/** Whether the entry showing came as a step of the app's own (`stepTo`). */
export const stepped = () => Boolean(window.history.state?.[HELD]?.stepped);

/**
 * Whatever shows is in the address – /de/app/familie/heute, /de/app/stempel
 * (address.ts). A step of one's own (another calendar, the other view,
 * the other page) is a new entry in the history (`go`, `toShelf`,
 * use-place.ts); this sets the address right in place: the first time, for
 * an address naming none or another calendar (one that is gone), after a
 * rename, in the other language. The entry keeps the calendar's id and its
 * view besides (`HELD`). No navigation: the page stays as it is – Next
 * learns the new path from `history` itself (usePathname), and adds its own
 * state to ours. The shelf's address waits for the device's copy too:
 * until then the entry still holds the calendar shown before.
 */
export const useHeldAddress = ({
  locale,
  onShelf,
  ready,
  shownId,
  slug,
  view,
  openDay,
  panel,
}: {
  locale: Locale;
  onShelf: boolean;
  ready: boolean;
  shownId: string | undefined;
  slug: string | undefined;
  view: CalendarView;
  openDay: DayKey | null;
  panel: Panel | null;
}) => {
  useEffect(() => {
    if (onShelf ? !ready : !shownId) return;
    const path = onShelf
      ? shelfAddressOf(locale, panel)
      : addressOf(locale, slug, view, { day: openDay, panel });
    const { pathname, search, hash } = window.location;
    const held = window.history.state?.[HELD];
    if (
      pathname === path &&
      held?.calendar === shownId &&
      held?.view === view
    ) {
      return;
    }
    // The entry of a day or a sheet stays a step of its own (`stepped`,
    // `stepTo`) – in the other language too, and from the settings on to
    // the share sheet.
    window.history.replaceState(
      { [HELD]: { ...((openDay || panel) && held), calendar: shownId, view } },
      "",
      `${path}${search}${hash}`
    );
  }, [locale, onShelf, ready, shownId, slug, view, openDay, panel]);
};

/**
 * Back and forth in the history: `onPop` hears of each move, once the
 * entry it moved to is the one showing – listened to from the start, the
 * same listener all along.
 */
export const useBackAndForth = (onPop: () => void) => {
  const pop = useEffectEvent(onPop);
  useEffect(() => {
    const listener = () => pop();
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
};
