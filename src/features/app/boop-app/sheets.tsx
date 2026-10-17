"use client";

import { AnimatePresence } from "motion/react";
import type { ColorName } from "@/features/calendar/model";
import { nextKey } from "@/features/calendar/palette";
import { colorOf, useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { addressOf, NOTHING, shelfAddressOf } from "../address";
import type { TrayProps } from "../day-page";
import { DaySheet } from "../day-sheet";
import {
  AccountSheet,
  Arrivals,
  CalendarSettings,
  CalendarSheet,
  ConfirmSheet,
  Invitations,
  ShareSheet,
  StampDrawer,
  StampSheet,
} from "./lazy-sheets";
import type { Place } from "./use-place";
import type { Sheets } from "./use-sheets";

/**
 * Everything that opens over the app: a day's sheet, the editor, the new
 * calendar's sheet, a calendar's settings and its share sheet, the
 * account's sheet, logging out, a stamp's sheet – and the popups, an
 * invitation and a stamp that came. Each in its own presence: there it can
 * go the way it came. Which is open is the app's (use-sheets.ts); all but
 * a day's sheet load when first wanted (lazy-sheets.ts).
 */
export const AppSheets = ({
  locale,
  place,
  sheets,
  tray,
  covered,
  settle,
  onLocale,
  onNewCalendar,
  onLogout,
}: {
  locale: Locale;
  place: Place;
  sheets: Sheets;
  tray: TrayProps;
  /** Something else lies over the app – the popups wait for it to go. */
  covered: boolean;
  /** The shelf's moment moves on (`useShelf`). */
  settle: () => void;
  onLocale: (locale: Locale) => void;
  onNewCalendar: (name: string, color: ColorName) => void;
  onLogout: () => void;
}) => {
  const t = dictionaryOf(locale);
  const boop = useBoop();
  const { shown, calendar, calendars, slugs, view, openDay, closeStep } = place;
  const { panel, edited, dialog, opened, settings, sharing } = sheets;
  const me = boop.me?.id;
  // The address in the other language – the view's word changes with it,
  // the shelf's too.
  const addressIn = (other: Locale) =>
    shown.shelf
      ? shelfAddressOf(other, panel)
      : addressOf(other, calendar && slugs[other].get(calendar.id), view, {
          day: openDay,
          panel,
        });
  // The calendar a stamp is drawn in, for the editor to offer it to its
  // members – none from the shelf, which stands apart from the calendars
  // (a stamp's sheet shares it with any of them).
  const drawnIn =
    !shown.shelf && calendar && calendar.members.length > 1
      ? calendar.id
      : null;

  return (
    <>
      <AnimatePresence
        onExitComplete={() => {
          sheets.setDayUp(false);
          // Gone: the shelf may show what was stamped there.
          settle();
        }}
      >
        {calendar && openDay && sheets.showDay && (
          <DaySheet
            {...tray}
            calendar={calendar.id}
            date={openDay}
            key="day"
            locale={locale}
            onClose={closeStep(() => place.setDay(null))}
          />
        )}
      </AnimatePresence>
      <AnimatePresence
        onExitComplete={() => {
          sheets.setDrawerUp(false);
          sheets.fromDay.current = false;
          // Drawn anew: back to the stamp's sheet it came from.
          if (sheets.backTo.current) sheets.setOpened(sheets.backTo.current);
          sheets.backTo.current = null;
        }}
      >
        {sheets.showDrawer && edited && (
          <StampDrawer
            ask={sheets.askLeave}
            calendar={drawnIn}
            key={`edit-${edited.id}`}
            locale={locale}
            onClose={closeStep(() => sheets.setEditing(null))}
            onDrawn={sheets.noteDrawn}
            // Saved: its sheet shows it as it is now.
            onSaved={(id) => {
              sheets.backTo.current = id;
            }}
            stamp={edited}
          />
        )}
        {sheets.showDrawer && !edited && (
          <StampDrawer
            ask={sheets.askLeave}
            calendar={drawnIn}
            key="drawer"
            locale={locale}
            onClose={closeStep(() => sheets.setDrawing(false))}
            onDrawn={sheets.noteDrawn}
            onSaved={(id) => {
              if (sheets.fromDay.current) sheets.setHanded(id);
            }}
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
            onClose={() => sheets.setDialog(null)}
            onSave={onNewCalendar}
            submit={t.app.create}
            title={t.app.newCalendar}
          />
        )}
      </AnimatePresence>
      <AnimatePresence
        onExitComplete={() => {
          // The settings are gone – now the share sheet they asked for.
          if (!sheets.shareNext.current) return;
          sheets.setSharing(sheets.shareNext.current);
          sheets.shareNext.current = null;
        }}
      >
        {settings && boop.calendars[settings] && (
          <CalendarSettings
            calendar={boop.calendars[settings]}
            key="settings"
            locale={locale}
            onClose={closeStep(() => sheets.setSettings(null))}
            onDeleted={() => {
              sheets.setSettings(null);
              place.setShown({ ...NOTHING });
            }}
            onShare={() => {
              sheets.shareNext.current = settings;
              sheets.setSettings(null);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {sheets.account && (
          <AccountSheet
            addressIn={addressIn}
            key="account"
            locale={locale}
            onClose={closeStep(() => sheets.setAccount(false))}
            onLocale={onLocale}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {dialog === "logout" && (
          <ConfirmSheet
            confirm={t.app.logout}
            key="logout"
            locale={locale}
            onClose={() => sheets.setDialog(null)}
            onConfirm={onLogout}
            title={t.app.logout}
          >
            {t.app.logoutPending(boop.pending)}
          </ConfirmSheet>
        )}
      </AnimatePresence>
      <AnimatePresence
        onExitComplete={() => {
          // The sheet is gone – now the editor it asked for.
          if (!sheets.editNext.current) return;
          sheets.setEditing(sheets.editNext.current);
          sheets.editNext.current = null;
        }}
      >
        {opened && boop.stamps[opened] && (
          <StampSheet
            key="stamp"
            locale={locale}
            mine={boop.stamps[opened].owner === me}
            onClose={() => sheets.setOpened(null)}
            onEdit={() => sheets.editStamp(opened)}
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
            onClose={closeStep(() => sheets.setSharing(null))}
          />
        )}
      </AnimatePresence>
      {/* An invitation waiting – once nothing else lies over the app; a
          yes shows the calendar. */}
      <Invitations
        hold={covered || sheets.arriving}
        locale={locale}
        onJoined={(id) => place.go(id, null)}
        onShowing={sheets.setInviting}
      />
      {/* A stamp that came – a gift from Boop, a card taken: greeted once,
          by the same rules. */}
      <Arrivals
        hold={covered || sheets.inviting}
        locale={locale}
        onShelf={place.toShelf}
        onShowing={sheets.setArriving}
      />
    </>
  );
};
