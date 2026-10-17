"use client";

import type { Snapshot } from "valtio";
import { PILL } from "@/components/ui";
import type { CalendarDoc } from "@/features/calendar/model";
import { hexOf } from "@/features/calendar/palette";
import { colorOf, useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { FADING, useFadingEdges } from "../fading-edges";
import { ahead } from "./later";
import { CalendarSheet } from "./lazy-sheets";

/**
 * The calendars' pills on the colored ground: see-through, the ground
 * showing – but the chosen one, which is paper white like the sheet it
 * belongs to, with a thicker line (not filled with ink: its words stay ink).
 */
const PILL_ON_GROUND =
  "scribble-clear aria-pressed:scribble-bold aria-pressed:[--scribble-fill:var(--color-card)]! aria-pressed:text-ink!";

/** The new calendar's sheet – fetched as one comes to the row. */
const newAhead = ahead(CalendarSheet);

/**
 * The account's calendars, a pill each – the chosen one pressed – and a
 * last one for a new calendar.
 */
export const CalendarRow = ({
  locale,
  calendars,
  chosen,
  onPick,
  onNew,
}: {
  locale: Locale;
  calendars: readonly Snapshot<CalendarDoc>[];
  /** The calendar showing, by id. */
  chosen: string | undefined;
  onPick: (id: string) => void;
  onNew: () => void;
}) => {
  const t = dictionaryOf(locale);
  const boop = useBoop();
  // On a phone it scrolls sideways, and fades where it goes on.
  const pills = useFadingEdges<HTMLElement>("x");
  return (
    // On phones a row to swipe, edge to edge – sideways only: up and down
    // the swipe is the page's. A scroller cuts off all round, so it pads
    // (and margins back) room for all a pill's frame may reach – its
    // wobble, lift and focus ring, 14px and a little: with less, the row
    // would scroll up and down by what sticks out. No bar – it fades where
    // it goes on (fading-edges.ts). Wider, they wrap: nothing cut, nothing
    // masked.
    <nav
      aria-label={t.app.calendars}
      className={cn(
        "-m-4 flex gap-2.5 overflow-x-auto overflow-y-hidden overscroll-x-contain p-4 sm:m-0 sm:flex-wrap sm:overflow-visible sm:mask-none sm:p-0",
        FADING.x
      )}
      onFocus={newAhead}
      onPointerEnter={newAhead}
      ref={pills}
    >
      {calendars.map((c) => {
        const active = c.id === chosen;
        return (
          <button
            aria-pressed={active}
            className={cn(PILL, PILL_ON_GROUND)}
            key={c.id}
            onClick={() => {
              if (!active) onPick(c.id);
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
                className={cn("text-xs", active ? "text-ink/70" : "text-muted")}
              >
                · {c.members.length}
              </span>
            )}
          </button>
        );
      })}
      <button
        className={cn(PILL, "scribble-dashed scribble-clear")}
        onClick={onNew}
        type="button"
      >
        + {t.app.newCalendar}
      </button>
    </nav>
  );
};
