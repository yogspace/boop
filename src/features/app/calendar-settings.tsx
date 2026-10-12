"use client";

import { type FormEvent, type ReactNode, type SVGProps, useState } from "react";
import type { Snapshot } from "valtio";
import { Bang } from "@/components/doodles";
import { Button, Field, Notice } from "@/components/ui";
import type { CalendarDoc, ColorName } from "@/features/calendar/model";
import { hexOf } from "@/features/calendar/palette";
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
import { ColorPicker, NameForm } from "./dialogs";
import { LeaveCalendar, Members } from "./share-sheet";
import { Sheet } from "./sheet";

// ── Doodles ─────────────────────────────────────────────────────────────────
// The two signs beside a calendar's name – drawn like the ones in
// components/doodles.tsx (round ends, a little wobbly, `currentColor`), where
// they belong: to move there. With more in them than an arrow, they want a
// little more room: `h-6 w-6` in a round button.

const doodle = (props: SVGProps<SVGSVGElement>) => ({
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 2.2,
  ...props,
});

/** Three sliders, each knob somewhere else – settings. */
export const Sliders = (props: SVGProps<SVGSVGElement>) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" {...doodle(props)}>
    <path d="M3.6 6.7C8.9 6.2 14.6 6.9 20.4 6.4M3.7 12.2C9.2 11.7 14.9 12.4 20.3 11.9M3.6 17.6C9 17.1 14.7 17.9 20.4 17.4" />
    <path
      d="M9 4.1C10.4 4 11.5 5.3 11.4 6.6C11.3 8 10.2 8.9 8.9 8.9C7.5 8.8 6.6 7.8 6.6 6.5C6.6 5.1 7.7 4.1 9 4.1ZM15.3 9.7C16.7 9.6 17.8 10.9 17.7 12.2C17.6 13.6 16.5 14.5 15.2 14.5C13.8 14.4 12.9 13.4 12.9 12.1C12.9 10.7 14 9.7 15.3 9.7ZM7.6 15.1C9 15 10.1 16.3 10 17.6C9.9 19 8.8 19.9 7.5 19.9C6.1 19.8 5.2 18.8 5.2 17.5C5.2 16.1 6.3 15.1 7.6 15.1Z"
      fill="currentColor"
      strokeWidth="1"
    />
  </svg>
);

/** Someone, and a plus – one more in: sharing. */
export const PersonPlus = (props: SVGProps<SVGSVGElement>) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" {...doodle(props)}>
    <path d="M9.4 3.6C11.6 3.5 13.3 5.3 13.2 7.5C13.1 9.6 11.4 11.3 9.2 11.2C7.1 11.1 5.4 9.5 5.5 7.3C5.6 5.2 7.2 3.7 9.4 3.6Z" />
    <path d="M2.7 20.3C2.9 16.8 5.6 14.6 9.4 14.6C13.1 14.7 15.8 16.9 16.1 20.2" />
    <path d="M19.2 5.1C19.1 7.2 19.3 9.2 19.2 11.3M16.2 8.3C18.2 8.1 20.2 8.4 22.2 8.2" />
  </svg>
);

// ── The sheet ───────────────────────────────────────────────────────────────

/**
 * A calendar's settings – opened by the sliders beside its name. In two
 * parts, each saying whom it is about:
 *
 * - **For everyone** – the calendar itself: its name and who is in it. Its
 *   owner's to change – the server holds to that (sync/apply.ts); anyone
 *   else reads.
 * - **Just for you** – how one sees it oneself: its color, and what one
 *   hears of it – the notifications (push/notification-settings.tsx).
 *
 * At the very end, below both, the way out: the owner deletes it (asked
 * twice), a member leaves it (asked once).
 *
 * A calendar's color is everyone's own, with one picker for it. A member's
 * pick stays with them (the own settings, offline/store.ts); the owner's is
 * the calendar's – so it follows them to their other devices, and it is
 * what everyone sees who picked none. Either is kept at once: the calendar
 * behind the sheet turns with it.
 *
 * Name, color and deleting work offline like everything kept on the device;
 * removing someone and leaving need a connection.
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
    // on this device (from when it wasn't theirs), it would hide the pick.
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
        {/* A reminder, “someone stamped” – each one's own. */}
        <NotificationSettings calendar={calendar} locale={locale} />
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
      <Button onClick={() => setStep("ask")} size="sm" variant="ghost">
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
