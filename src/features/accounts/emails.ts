import { isLocale, type Locale } from "@/i18n/config";
import { mailLayout } from "@/lib/mail-layout";
import { serverUrl } from "@/lib/server-url";
import { UNVERIFIED_DAYS, WARNING_DAYS } from "./retention";

/**
 * The mails to accounts, in the account's language: those Payload sends –
 * confirming the address after sign-up, choosing a new password; the links
 * lead to the site's own pages, which pass the token on to Payload – and
 * the cleanup's one before an unused account goes (cleanup.ts).
 */

type Who = { name?: string | null; locale?: string | null };

export const localeOf = (user: unknown): Locale => {
  const locale = (user as Who | undefined)?.locale;
  return isLocale(locale) ? locale : "de";
};

const nameOf = (user: unknown) =>
  (user as Who | undefined)?.name?.trim() || null;

/** Valid this long – said in the mail, set in the collection. */
export const RESET_HOURS = 1;

const TEXT = {
  de: {
    verify: {
      subject: "Bestätige deine Adresse für Boop",
      hello: (name: string | null) => (name ? `Hallo ${name}!` : "Hallo!"),
      title: "Fast geschafft",
      body: "Schön, dass du da bist. Bestätige noch kurz deine E-Mail-Adresse – dann kannst du loslegen und stempeln.",
      button: "Adresse bestätigen",
      footnote: `Du hast dich nicht bei Boop angemeldet? Dann ignoriere diese Mail einfach – ohne Bestätigung löschen wir die Anmeldung nach ${UNVERIFIED_DAYS} Tagen.`,
    },
    reset: {
      subject: "Ein neues Passwort für Boop",
      title: "Neues Passwort",
      body: `Jemand – hoffentlich du – möchte das Passwort für dein Boop-Konto ändern. Der Link gilt ${RESET_HOURS} Stunde.`,
      button: "Neues Passwort wählen",
      footnote:
        "Das warst du nicht? Dann bleibt alles, wie es ist – dein Passwort ändert sich nur über den Link.",
    },
    inactive: {
      subject: "Wir vermissen dich bei Boop",
      hello: (name: string | null) => (name ? `Hallo ${name}!` : "Hallo!"),
      title: "Lange nicht gesehen",
      body: (date: string) =>
        `Wir haben dich lange nicht bei Boop gesehen. In ${WARNING_DAYS} Tagen, ab dem ${date}, löschen wir dein Konto – samt deinen Kalendern und Stempeln.`,
      stay: "Einmal anmelden genügt, dann bleibt alles, wie es ist.",
      button: "Zu Boop",
      footnote:
        "Du magst Boop nicht mehr nutzen? Dann musst du nichts tun. Deine Daten kannst du vorher in der App unter „Konto“ herunterladen.",
    },
  },
  en: {
    verify: {
      subject: "Confirm your address for Boop",
      hello: (name: string | null) => (name ? `Hi ${name}!` : "Hi!"),
      title: "Almost there",
      body: "Lovely to have you. Just confirm your email address – then you're ready to start stamping.",
      button: "Confirm address",
      footnote: `You didn't sign up for Boop? Then simply ignore this mail – without confirmation we delete the sign-up after ${UNVERIFIED_DAYS} days.`,
    },
    reset: {
      subject: "A new password for Boop",
      title: "New password",
      body: `Someone – hopefully you – wants to change the password of your Boop account. The link is valid for ${RESET_HOURS} hour.`,
      button: "Choose a new password",
      footnote:
        "Wasn't you? Then nothing changes – your password only changes through the link.",
    },
    inactive: {
      subject: "We miss you at Boop",
      hello: (name: string | null) => (name ? `Hi ${name}!` : "Hi!"),
      title: "Long time no see",
      body: (date: string) =>
        `We haven't seen you at Boop for a long time. In ${WARNING_DAYS} days, from ${date}, we'll delete your account – with your calendars and stamps.`,
      stay: "Logging in once is enough, and everything stays as it is.",
      button: "Open Boop",
      footnote:
        "Don't want to use Boop anymore? Then you don't need to do anything. You can download your data first in the app under “Account”.",
    },
  },
} as const;

export const verifySubject = (user: unknown) =>
  TEXT[localeOf(user)].verify.subject;

export const verifyHtml = ({
  token,
  user,
}: {
  token: string;
  user: unknown;
}) => {
  const locale = localeOf(user);
  const t = TEXT[locale].verify;
  return mailLayout({
    lang: locale,
    preheader: t.body,
    title: t.title,
    paragraphs: [t.hello(nameOf(user)), t.body],
    button: {
      label: t.button,
      url: `${serverUrl()}/${locale}/verify?token=${encodeURIComponent(token)}`,
    },
    footnote: t.footnote,
  });
};

export const resetSubject = (user: unknown) =>
  TEXT[localeOf(user)].reset.subject;

export const resetHtml = ({
  token,
  user,
}: {
  token?: string;
  user?: unknown;
}) => {
  const locale = localeOf(user);
  const t = TEXT[locale].reset;
  return mailLayout({
    lang: locale,
    preheader: t.body,
    title: t.title,
    paragraphs: [t.body],
    button: {
      label: t.button,
      url: `${serverUrl()}/${locale}/reset-password?token=${encodeURIComponent(token ?? "")}`,
    },
    footnote: t.footnote,
  });
};

/**
 * The mail before an unused account goes (cleanup.ts): when, what goes, and
 * that one login keeps it – as HTML and as plain text.
 */
export const inactiveMail = ({
  user,
  deleteFrom,
}: {
  user: unknown;
  /** The first day it may go. */
  deleteFrom: Date;
}) => {
  const locale = localeOf(user);
  const t = TEXT[locale].inactive;
  const date = deleteFrom.toLocaleDateString(
    locale === "de" ? "de-DE" : "en-GB",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Berlin",
    }
  );
  const url = `${serverUrl()}/${locale}/app`;
  const paragraphs = [t.hello(nameOf(user)), t.body(date), t.stay];
  return {
    subject: t.subject,
    html: mailLayout({
      lang: locale,
      preheader: t.body(date),
      title: t.title,
      paragraphs,
      button: { label: t.button, url },
      footnote: t.footnote,
    }),
    text: [...paragraphs, `${t.button}: ${url}`, t.footnote].join("\n\n"),
  };
};
