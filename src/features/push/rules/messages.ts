// Relative, not `@/…`: the unit tests import this without the app's aliases.
import type { Locale } from "../../../i18n/config";
import { dictionaryOf } from "../../../i18n/dictionaries";
import { type CalendarChange, distinctChanges } from "./changes";

/**
 * The notifications' words, in the device's language – one message per
 * kind of news, and where a tap leads.
 */

/**
 * What a notification shows – and nothing else: no token, no ids but the
 * calendar's (in its address). The service worker (public/sw-push.js)
 * shows it as it comes.
 */
export type PushMessage = {
  title: string;
  body: string;
  /** Where a tap leads – the calendar in the app, or the app. */
  url: string;
  /** One per calendar and kind on the device: a new one replaces it. */
  tag: string;
};

/** The calendar in the app – the app opens it by its id, too. */
export const calendarUrl = (locale: Locale, calendar: string) =>
  `/${locale}/app/${encodeURIComponent(calendar)}`;

/**
 * What a notification says. `t`: the texts – the server's callers pass the
 * CMS's (`getDictionary`, features/translations); without, the code's.
 */
export const stampedMessage = (
  locale: Locale,
  { name, calendar }: { name: string; calendar: { id: string; name: string } },
  t = dictionaryOf(locale).app.push
): PushMessage => {
  return {
    title: t.stampedTitle,
    body: t.stampedBody(name.trim() || t.someone, calendar.name),
    url: calendarUrl(locale, calendar.id),
    tag: `stamped-${calendar.id}`,
  };
};

/**
 * “Anna invited you to ‘Family’” – for the one invited. A tap leads to the
 * app, where the invitation is to show – not into the calendar itself.
 */
export const invitedMessage = (
  locale: Locale,
  { name, calendar }: { name: string; calendar: { id: string; name: string } },
  t = dictionaryOf(locale).app.push
): PushMessage => {
  return {
    title: t.invitedTitle,
    body: t.invitedBody(name.trim() || t.someone, calendar.name),
    url: `/${locale}/app`,
    tag: `invited-${calendar.id}`,
  };
};

/**
 * “Boop gave you a stamp: ‘Pumpkin’” – for those who got it. A tap opens
 * the app, where the gift shows.
 */
export const giftMessage = (
  locale: Locale,
  { gift, name }: { gift: string; name: string },
  t = dictionaryOf(locale).app.push
): PushMessage => {
  return {
    title: t.giftTitle,
    body: t.giftBody(name),
    url: `/${locale}/app`,
    tag: `gift-${gift}`,
  };
};

/**
 * Someone's changes in a calendar: what they did – one thing by its name,
 * more as “a few things” – or null when, all told, nothing changed (a name
 * changed and back). `calendar.name` is the name now; who came or went goes
 * by their own (`people`).
 */
export const changedMessage = (
  locale: Locale,
  {
    name,
    calendar,
    changes,
    people,
  }: {
    /** Who changed it. */
    name: string;
    calendar: { id: string; name: string };
    changes: readonly CalendarChange[];
    /** The names of whom changes are about, by account. */
    people: Readonly<Record<string, string>>;
  },
  t = dictionaryOf(locale).app.push
): PushMessage | null => {
  const news = distinctChanges(changes).filter(
    (change) => !(change.kind === "renamed" && change.from === calendar.name)
  );
  const [only] = news;
  if (!only) return null;
  const named = (value: string | undefined) => value?.trim() || t.someone;
  const values = { name: named(name), calendar: calendar.name };
  const body =
    news.length > 1
      ? t.changedBody("several", values)
      : "who" in only
        ? t.changedBody(only.kind, { ...values, name: named(people[only.who]) })
        : t.changedBody(only.kind, {
            ...values,
            from: only.kind === "renamed" ? only.from : "",
          });
  return {
    title: t.changedTitle,
    body,
    url: calendarUrl(locale, calendar.id),
    tag: `changed-${calendar.id}`,
  };
};

export const reminderMessage = (
  locale: Locale,
  calendars: readonly { id: string; name: string }[],
  t = dictionaryOf(locale).app.push
): PushMessage => {
  return {
    title: t.reminderTitle,
    body: t.reminderBody(calendars.map((calendar) => calendar.name)),
    url: calendars[0] ? calendarUrl(locale, calendars[0].id) : `/${locale}/app`,
    tag: "reminder",
  };
};
