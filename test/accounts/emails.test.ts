import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emailChangedMail,
  newEmailMail,
} from "../../src/features/accounts/emails";
import type { Locale } from "../../src/i18n/config";
import { setTexts } from "../../src/i18n/dictionaries";
import { mailLayout } from "../../src/lib/mail-layout";

// The mails speak in the app's paths (@/…), which the tests don't resolve –
// the same modules, by their relative ones. The CMS's texts are those
// `setTexts` put in use: `getDictionary` would read them from the database.
vi.mock("@/i18n/config", () => import("../../src/i18n/config"));
vi.mock("@/lib/mail-layout", () => import("../../src/lib/mail-layout"));
vi.mock("@/lib/server-url", () => import("../../src/lib/server-url"));
vi.mock("@/features/translations/get-texts", async () => {
  const { dictionaryOf } = await import("../../src/i18n/dictionaries");
  return { getDictionary: async (locale: Locale) => dictionaryOf(locale) };
});

const SITE = "https://boop.example";
vi.stubEnv("NEXT_PUBLIC_SERVER_URL", SITE);

afterEach(() => setTexts({}));

const TOKEN = "a1b2/c3+d4";

/** The two mails around a new address, word for word. */
const WORDS = {
  de: {
    hello: { named: "Hallo Anna!", unnamed: "Hallo!" },
    newEmail: {
      subject: "Bestätige deine neue Adresse für Boop",
      title: "Neue Adresse",
      body: "Du möchtest dich bei Boop künftig mit dieser Adresse anmelden. Bestätige sie kurz – der Link gilt 24 Stunden. Bis dahin bleibt deine bisherige Adresse.",
      button: "Neue Adresse bestätigen",
      footnote:
        "Das warst du nicht? Dann ignoriere diese Mail einfach – ohne Bestätigung ändert sich nichts.",
    },
    emailChanged: {
      subject: "Deine Adresse bei Boop wurde geändert",
      title: "Adresse geändert",
      body: "Dein Boop-Konto hat jetzt eine neue E-Mail-Adresse. Diese hier gilt dafür nicht mehr – angemeldet wird ab sofort mit der neuen.",
      notYou:
        "Das warst du nicht? Dann melde dich bitte gleich bei uns – über das Kontaktformular.",
      button: "Zum Kontaktformular",
      footnote:
        "Du bekommst diese Mail, weil diese Adresse bis eben zu einem Boop-Konto gehörte.",
    },
  },
  en: {
    hello: { named: "Hi Anna!", unnamed: "Hi!" },
    newEmail: {
      subject: "Confirm your new address for Boop",
      title: "New address",
      body: "You'd like to log in to Boop with this address from now on. Just confirm it – the link is valid for 24 hours. Until then your old address stays.",
      button: "Confirm new address",
      footnote:
        "Wasn't you? Then simply ignore this mail – nothing changes without confirmation.",
    },
    emailChanged: {
      subject: "Your address at Boop was changed",
      title: "Address changed",
      body: "Your Boop account has a new email address now. This one no longer counts for it – logging in works with the new one from now on.",
      notYou:
        "Wasn't you? Then please get in touch right away – through the contact form.",
      button: "To the contact form",
      footnote:
        "You're getting this mail because this address belonged to a Boop account until just now.",
    },
  },
} as const;

const NAMES = { named: "Anna", unnamed: "  " } as const;

describe("the mails around a new address", () => {
  for (const locale of ["de", "en"] as const) {
    for (const variant of ["named", "unnamed"] as const) {
      const user = { locale, name: NAMES[variant] };
      const hello = WORDS[locale].hello[variant];

      it(`to the new address, with its link – ${locale}, ${variant}`, async () => {
        const t = WORDS[locale].newEmail;
        expect(await newEmailMail({ token: TOKEN, user })).toEqual({
          subject: t.subject,
          html: mailLayout({
            lang: locale,
            preheader: t.body,
            title: t.title,
            paragraphs: [hello, t.body],
            button: {
              label: t.button,
              url: `${SITE}/${locale}/change-email?token=a1b2%2Fc3%2Bd4`,
            },
            footnote: t.footnote,
          }),
        });
      });

      it(`to the old one, once it is changed – ${locale}, ${variant}`, async () => {
        const t = WORDS[locale].emailChanged;
        expect(await emailChangedMail({ user })).toEqual({
          subject: t.subject,
          html: mailLayout({
            lang: locale,
            preheader: t.body,
            title: t.title,
            paragraphs: [hello, t.body, t.notYou],
            // The contact form is in the imprint.
            button: { label: t.button, url: `${SITE}/${locale}/legal` },
            footnote: t.footnote,
          }),
        });
      });
    }
  }

  it("are in German for an account without a language", async () => {
    const mail = await newEmailMail({ token: TOKEN, user: { locale: "fr" } });
    expect(mail.subject).toBe(WORDS.de.newEmail.subject);
    expect(mail.html).toContain(`${SITE}/de/change-email?token=`);
    expect((await emailChangedMail({ user: undefined })).subject).toBe(
      WORDS.de.emailChanged.subject
    );
  });

  it("take the CMS's words where they fit – the hours filled in, or left out", async () => {
    setTexts({
      de: {
        "mail.newEmail.subject": "Deine neue Adresse",
        "mail.newEmail.body": "Der Link gilt {hours} Stunden.",
        "mail.newEmail.hello.named": "Moin {name},",
        "mail.emailChanged.notYou": "Nicht du? Schreib uns.",
      },
      en: { "mail.newEmail.body": "The link is good for a day." },
    });
    const anna = { locale: "de", name: "Anna" };
    const mail = await newEmailMail({ token: TOKEN, user: anna });
    expect(mail.subject).toBe("Deine neue Adresse");
    expect(mail.html).toContain(">Moin Anna,<");
    expect(mail.html).toContain(">Der Link gilt 24 Stunden.<");
    expect((await emailChangedMail({ user: anna })).html).toContain(
      ">Nicht du? Schreib uns.<"
    );
    expect(
      (await newEmailMail({ token: TOKEN, user: { locale: "en" } })).html
    ).toContain(">The link is good for a day.<");
  });

  it("keep the code's where the CMS's don't fit", async () => {
    setTexts({ de: { "mail.newEmail.body": "Gilt {stunden} Stunden." } });
    expect(
      (await newEmailMail({ token: TOKEN, user: { locale: "de" } })).html
    ).toContain(WORDS.de.newEmail.body);
  });
});
