"use client";

import type { ReactNode } from "react";
import type { Snapshot } from "valtio";
import { Check, Plus } from "@/components/doodles";
import type { CalendarDoc } from "@/features/calendar/model";
import { hexOf } from "@/features/calendar/palette";
import { colorOf, useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { Fold } from "../calendar-signs";
import { DROP_ITEM, DropMenu } from "../drop-menu";
import { ahead } from "./later";
import { CalendarSheet } from "./lazy-sheets";

/** The new calendar's sheet – fetched as one comes to the name. */
const newAhead = ahead(CalendarSheet);

/**
 * The calendar's name over its page – and the way to the others: pressed,
 * the account's calendars fold out under it (drop-menu.tsx), each in its
 * color and with how many are in it, the one showing ticked; and last, a
 * new one (`onNew`).
 */
export const CalendarMenu = ({
  locale,
  calendar,
  calendars,
  onPick,
  onNew,
  children,
}: {
  locale: Locale;
  /** The one showing. */
  calendar: Snapshot<CalendarDoc>;
  calendars: readonly Snapshot<CalendarDoc>[];
  onPick: (id: string) => void;
  onNew: () => void;
  /** The name, as it shows. */
  children: ReactNode;
}) => {
  const t = dictionaryOf(locale);
  const boop = useBoop();
  return (
    <DropMenu
      button={(wears) => (
        <button
          {...wears}
          className="group flex max-w-full items-center gap-1 text-left"
          onFocus={newAhead}
          onPointerEnter={newAhead}
          type="button"
        >
          <span className="sr-only">{t.app.calendars}: </span>
          {children}
          <Fold className="h-6 w-6 shrink-0 transition-transform duration-200 group-aria-expanded:rotate-180" />
        </button>
      )}
      className="min-w-0"
      label={t.app.calendars}
      listClassName="w-72"
    >
      {(close) => (
        <>
          <p className="px-3 pt-1 pb-1.5 font-bold text-muted text-xs">
            {t.app.calendars}
          </p>
          {calendars.map((c) => {
            const showing = c.id === calendar.id;
            return (
              <button
                aria-pressed={showing}
                className={DROP_ITEM}
                key={c.id}
                onClick={() => {
                  close();
                  if (!showing) onPick(c.id);
                }}
                type="button"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border-2 border-current"
                    style={{ background: hexOf(colorOf(boop, c)) }}
                  />
                  <span className="truncate">{c.name}</span>
                  {c.members.length > 1 && (
                    <span className="shrink-0 text-muted text-xs">
                      · {c.members.length}
                    </span>
                  )}
                </span>
                {showing && <Check className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}
          <button
            className="scribble scribble-dashed scribble-clear scribble-sm mt-1.5 flex min-h-10 items-center gap-2 rounded-2xl px-3 py-2 text-left font-bold text-sm hover:scribble-soft"
            onClick={() => {
              close();
              onNew();
            }}
            type="button"
          >
            <Plus className="h-4 w-4 shrink-0" />
            {t.app.newCalendar}
          </button>
        </>
      )}
    </DropMenu>
  );
};
