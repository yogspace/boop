import { isLocale, type Locale } from "@/i18n/config";
import { mailLayout } from "@/lib/mail-layout";
import { serverUrl } from "@/lib/server-url";

/**
 * The mails Payload sends for accounts – confirming the address after
 * sign-up and choosing a new password – in the account's language. The
 * links lead to the site's own pages, which pass the token on to Payload.
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
      footnote:
        "Du hast dich nicht bei Boop angemeldet? Dann ignoriere diese Mail einfach.",
    },
    reset: {
      subject: "Ein neues Passwort für Boop",
      title: "Neues Passwort",
      body: `Jemand – hoffentlich du – möchte das Passwort für dein Boop-Konto ändern. Der Link gilt ${RESET_HOURS} Stunde.`,
      button: "Neues Passwort wählen",
      footnote:
        "Das warst du nicht? Dann bleibt alles, wie es ist – dein Passwort ändert sich nur über den Link.",
    },
  },
  en: {
    verify: {
      subject: "Confirm your address for Boop",
      hello: (name: string | null) => (name ? `Hi ${name}!` : "Hi!"),
      title: "Almost there",
      body: "Lovely to have you. Just confirm your email address – then you're ready to start stamping.",
      button: "Confirm address",
      footnote: "You didn't sign up for Boop? Then simply ignore this mail.",
    },
    reset: {
      subject: "A new password for Boop",
      title: "New password",
      body: `Someone – hopefully you – wants to change the password of your Boop account. The link is valid for ${RESET_HOURS} hour.`,
      button: "Choose a new password",
      footnote:
        "Wasn't you? Then nothing changes – your password only changes through the link.",
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
