import { getDictionary } from "@/features/translations/get-texts";
import { isLocale, type Locale } from "@/i18n/config";
import { mailLayout } from "@/lib/mail-layout";
import { serverUrl } from "@/lib/server-url";

/**
 * The mails to accounts, in the account's language: those Payload sends –
 * confirming the address after sign-up, choosing a new password; the links
 * lead to the site's own pages, which pass the token on to Payload – and
 * the cleanup's one before an unused account goes (cleanup.ts).
 *
 * Their words are the dictionary's (`mail`, i18n/dictionaries.ts), the
 * CMS's where it has them – read as the mail is made, as no page brings
 * them along. So every mail here is async; Payload awaits subject and HTML.
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

/** A mail's words in the account's language – the CMS's where it has them. */
const wordsFor = async (user: unknown) => {
  const locale = localeOf(user);
  return { locale, mail: (await getDictionary(locale)).mail };
};

export const verifySubject = async (user: unknown) =>
  (await wordsFor(user)).mail.verify.subject;

export const verifyHtml = async ({
  token,
  user,
}: {
  token: string;
  user: unknown;
}) => {
  const { locale, mail } = await wordsFor(user);
  const t = mail.verify;
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

export const resetSubject = async (user: unknown) =>
  (await wordsFor(user)).mail.reset.subject;

export const resetHtml = async ({
  token,
  user,
}: {
  token?: string;
  user?: unknown;
}) => {
  const { locale, mail } = await wordsFor(user);
  const t = mail.reset;
  const body = t.body(RESET_HOURS);
  return mailLayout({
    lang: locale,
    preheader: body,
    title: t.title,
    paragraphs: [body],
    button: {
      label: t.button,
      url: `${serverUrl()}/${locale}/reset-password?token=${encodeURIComponent(token ?? "")}`,
    },
    footnote: t.footnote,
  });
};

/**
 * The mail before an unused account goes (cleanup.ts): when, what goes, and
 * that one login keeps it – as HTML and as plain text, of the same words.
 */
export const inactiveMail = async ({
  user,
  deleteFrom,
}: {
  user: unknown;
  /** The first day it may go. */
  deleteFrom: Date;
}) => {
  const { locale, mail } = await wordsFor(user);
  const t = mail.inactive;
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
  const body = t.body(date);
  const paragraphs = [t.hello(nameOf(user)), body, t.stay];
  return {
    subject: t.subject,
    html: mailLayout({
      lang: locale,
      preheader: body,
      title: t.title,
      paragraphs,
      button: { label: t.button, url },
      footnote: t.footnote,
    }),
    text: [...paragraphs, `${t.button}: ${url}`, t.footnote].join("\n\n"),
  };
};
