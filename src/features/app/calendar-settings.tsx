"use client";

import { LayoutGroup } from "motion/react";
import { type FormEvent, type ReactNode, useState } from "react";
import type { Snapshot } from "valtio";
import { Bang } from "@/components/doodles";
import { Button, Field, Notice } from "@/components/ui";
import type { CalendarDoc, ColorName } from "@/features/calendar/model";
import { hexOf } from "@/features/calendar/palette";
import { CalendarFeed } from "@/features/ical/calendar-feed";
import {
  colorOf,
  deleteCalendar,
  prefOf,
  renameCalendar,
  setCalendarPref,
  useBoop,
} from "@/features/offline/store";
import { NotificationSettings } from "@/features/push/notification-settings";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { START_VIEW } from "./address";
import { PersonPlus } from "./calendar-signs";
import { ColorPicker, NameForm } from "./dialogs";
import { LeaveCalendar, Members } from "./share-sheet";
import { Sheet } from "./sheet";
import { ViewSwitch } from "./view-switch";

export { PersonPlus, Sliders } from "./calendar-signs";

/**
 * A calendar's settings – opened by the sliders beside its name. In two
 * parts, each saying whom it is about:
 *
 * - **For everyone** – the calendar itself: its name and who is in it. Its
 *   owner's to change – the server holds to that (sync/apply.ts); anyone
 *   else reads.
 * - **Just for you** – how one sees it oneself: its color, the view it
 *   opens in, what one hears of it – the notifications
 *   (push/notification-settings.tsx) – and one's own address to have it in
 *   a calendar app (ical/calendar-feed.tsx).
 *
 * At the very end, below both, the way out: the owner deletes it (asked
 * twice), a member leaves it (asked once).
 *
 * A calendar's color is everyone's own, with one picker for it. A member's
 * pick stays with them (the own settings, offline/store.ts – on all their
 * devices); the owner's is the calendar's – what everyone sees who picked
 * none. Either is kept at once: the calendar behind the sheet turns with
 * it.
 *
 * Name, color and deleting work offline like everything kept on the device;
 * removing someone, leaving and the calendar app's address need a
 * connection.
 */
export const CalendarSettings = ({
  calendar,
  locale,
  onShare,
  onDeleted,
  onClose,
}: {
  calendar: Snapshot<CalendarDoc>;
  locale: Locale;
  /** To the invitations (the share sheet) – for the owner. */
  onShare?: () => void;
  /** The calendar is gone – whatever showed it moves on. */
  onDeleted: () => void;
  onClose: () => void;
}) => {
  const t = dictionaryOf(locale);
  const boop = useBoop();
  const { me, people, online } = boop;
  const owner = calendar.owner === me?.id;
  const own = prefOf(boop, calendar.id);

  const pick = (color: ColorName) => {
    if (!owner) {
      void setCalendarPref(calendar.id, { color });
      return;
    }
    if (color !== calendar.color) {
      void renameCalendar(calendar.id, calendar.name, color);
    }
    // The owner's color is the calendar's. Should one of their own be left
    // (from when it wasn't theirs), it would hide the pick.
    if (own.color) void setCalendarPref(calendar.id, { color: null });
  };

  return (
    <Sheet onClose={onClose} title={t.app.settings.title}>
      <Part
        text={
          owner
            ? t.app.settings.shared.owner
            : t.app.settings.shared.member(people[calendar.owner] ?? "…")
        }
        title={t.app.settings.shared.title}
      >
        {owner ? (
          <NameForm
            label={t.app.newCalendarName}
            maxLength={60}
            name={calendar.name}
            onSave={(name) => void renameCalendar(calendar.id, name)}
            placeholder={t.app.calendarPlaceholder}
            required
            save={t.app.save}
          />
        ) : (
          <div className="flex flex-col gap-1">
            <p className="font-bold text-sm">{t.app.newCalendarName}</p>
            <p className="wrap-break-word font-black text-xl">
              {calendar.name}
            </p>
          </div>
        )}
        {owner && calendar.members.length > 1 && !online && (
          <Notice>{t.auth.offline}</Notice>
        )}
        <Members
          action={
            owner &&
            onShare && (
              <Button onClick={onShare} size="sm" variant="plain">
                <PersonPlus className="h-5 w-5" />
                {t.app.share.add}
              </Button>
            )
          }
          calendar={calendar}
          locale={locale}
          quiet
        />
      </Part>
      {/* A marker line between the two. */}
      <span aria-hidden="true" className="scribble-rule" />
      <Part text={t.app.settings.own.text} title={t.app.settings.own.title}>
        <ColorPicker
          locale={locale}
          onChange={pick}
          value={colorOf(boop, calendar)}
        >
          {/* A member's pick is theirs alone – said once; the owner's needs
              no words. */}
          {!owner && (
            <p className="font-medium text-muted text-sm">
              {t.app.settings.own.colorMember}
            </p>
          )}
          {/* Back to the calendar's own color – whose dot shows which. */}
          {!owner && own.color && (
            <Button
              className="mt-3 animate-fade"
              onClick={() => void setCalendarPref(calendar.id, { color: null })}
              size="sm"
              variant="plain"
            >
              <span
                className="h-3 w-3 rounded-full border-2 border-current"
                style={{ background: hexOf(calendar.color) }}
              />
              {t.app.settings.own.colorReset}
            </Button>
          )}
        </ColorPicker>
        {/* The view it opens in – the month, until another is picked. Kept
            with the account like the color; switching views leaves it be. The
            switch's stroke is its own: the one beside the calendar's name
            is still there, behind the sheet. */}
        <div className="flex flex-col gap-3">
          <p aria-hidden="true" className="font-bold text-sm">
            {t.app.settings.own.start}
          </p>
          <LayoutGroup id="start">
            <ViewSwitch
              label={t.app.settings.own.start}
              locale={locale}
              onPick={(start) => void setCalendarPref(calendar.id, { start })}
              view={own.start ?? START_VIEW}
            />
          </LayoutGroup>
          <p className="font-medium text-muted text-sm">
            {t.app.settings.own.startText}
          </p>
        </div>
        {/* A reminder, “someone stamped” – each one's own. */}
        <NotificationSettings calendar={calendar} locale={locale} />
        {/* In a calendar app: one's own address to subscribe to, or a file. */}
        <CalendarFeed calendar={calendar} locale={locale} />
      </Part>
      {/* The way out – the owner's or a member's – last of all. */}
      <span aria-hidden="true" className="scribble-rule" />
      {owner ? (
        <DeleteCalendar
          calendar={calendar}
          locale={locale}
          onDeleted={() => {
            onDeleted();
            onClose();
          }}
        />
      ) : (
        <>
          {!online && <Notice>{t.auth.offline}</Notice>}
          <LeaveCalendar calendar={calendar} locale={locale} onLeft={onClose} />
        </>
      )}
    </Sheet>
  );
};

/**
 * One of the sheet's two parts: whom it is about, in a line – and what is
 * in it.
 */
const Part = ({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children: ReactNode;
}) => (
  <section className="flex flex-col gap-4">
    <div>
      <h3 className="font-black text-xl">{title}</h3>
      <p className="font-medium text-muted text-sm">{text}</p>
    </div>
    {children}
  </section>
);

/** Names as typed by hand: case and stray blanks don't count. */
const plain = (name: string) =>
  name.trim().replace(/\s+/g, " ").toLocaleLowerCase();

/**
 * The way out, asked twice: first whether at all – with what goes along –
 * then the calendar's name, typed. Only that wakes the last button.
 */
const DeleteCalendar = ({
  calendar,
  locale,
  onDeleted,
}: {
  calendar: Snapshot<CalendarDoc>;
  locale: Locale;
  onDeleted: () => void;
}) => {
  const t = dictionaryOf(locale);
  const [step, setStep] = useState<"rest" | "ask" | "type">("rest");
  const [typed, setTyped] = useState("");
  const others = calendar.members.length - 1;
  const sure = plain(typed) === plain(calendar.name);
  const back = () => {
    setStep("rest");
    setTyped("");
  };
  const remove = (event: FormEvent) => {
    event.preventDefault();
    if (!sure) return;
    void deleteCalendar(calendar.id);
    onDeleted();
  };

  if (step === "rest") {
    return (
      <Button
        className="self-start"
        onClick={() => setStep("ask")}
        size="sm"
        variant="danger"
      >
        {t.app.deleteCalendar}
      </Button>
    );
  }
  return (
    // Watch out: a thick frame and an exclamation mark, like an error. The
    // frames inside keep their own line – a frame's width is handed down.
    <div className="scribble scribble-bold rounded-2xl">
      <form
        className="flex animate-fade flex-col gap-3 p-4 [--scribble-width:3px]"
        key={step}
        onSubmit={remove}
      >
        <p className="flex items-start gap-2.5 font-bold">
          <Bang className="h-6 w-6 shrink-0" />
          <span className="wrap-break-word min-w-0">
            {step === "ask"
              ? [
                  t.app.deleteCalendarConfirm(calendar.name),
                  others > 0 && t.app.settings.deleteShared(others),
                ]
                  .filter(Boolean)
                  .join(" ")
              : t.app.settings.deleteType(calendar.name)}
          </span>
        </p>
        {step === "type" && (
          <Field
            autoCapitalize="off"
            autoComplete="off"
            autoFocus
            label={t.app.newCalendarName}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={calendar.name}
            value={typed}
          />
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={back} size="sm" variant="ghost">
            {t.app.draw.cancel}
          </Button>
          {step === "ask" ? (
            <Button onClick={() => setStep("type")} size="sm" variant="plain">
              {t.app.settings.deleteNext}
            </Button>
          ) : (
            <Button disabled={!sure} size="sm" type="submit" variant="danger">
              {t.app.settings.deleteForGood}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
};
