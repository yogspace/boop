import type { Field, PayloadRequest } from "payload";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inactiveMail,
  resetHtml,
  resetSubject,
  verifyHtml,
  verifySubject,
} from "../../src/features/accounts/emails";
import { invite } from "../../src/features/calendar/invites";
import {
  TRANSLATION_DEFAULTS,
  TRANSLATION_KEYS,
} from "../../src/features/translations/defaults";
import { translationFields } from "../../src/features/translations/tree";
import type { Locale } from "../../src/i18n/config";
import {
  dictionaryOf,
  PLACEHOLDERS,
  setTexts,
} from "../../src/i18n/dictionaries";
import { mailLayout } from "../../src/lib/mail-layout";

// The mails speak in the app's paths (@/…), which the tests don't resolve –
// the same modules, by their relative ones. The CMS's texts are those
// `setTexts` put in use: `getDictionary` would read them from the database.
vi.mock("@/i18n/config", () => import("../../src/i18n/config"));
vi.mock("@/i18n/dictionaries", () => import("../../src/i18n/dictionaries"));
vi.mock("@/lib/mail-layout", () => import("../../src/lib/mail-layout"));
vi.mock("@/lib/server-url", () => import("../../src/lib/server-url"));
vi.mock("@/features/translations/get-texts", async () => {
  const { dictionaryOf } = await import("../../src/i18n/dictionaries");
  return { getDictionary: async (locale: Locale) => dictionaryOf(locale) };
});
// What the invitations' module needs besides its mail.
vi.mock("@/access", () => ({ hiddenUnlessSupport: () => true, sealed: {} }));
vi.mock("@/features/accounts/session", () => ({
  sessionAccount: async () => null,
}));
vi.mock("@/features/sync/live", () => ({ nudgeCalendars: async () => {} }));
vi.mock("../../src/features/calendar/membership", () => ({
  calendarById: async () => null,
  idOf: (value: unknown) => (value ? String(value) : null),
}));

const SITE = "https://boop.example";
vi.stubEnv("NEXT_PUBLIC_SERVER_URL", SITE);

afterEach(() => setTexts({}));

const TOKEN = "a1b2/c3+d4";
const DELETE_FROM = new Date("2026-11-14T10:00:00.000Z");

/**
 * The mails as they were, word for word – before their texts moved into the
 * dictionary (i18n/dictionaries.ts): the same words must come out of it.
 */
const WAS = {
  de: {
    hello: { named: "Hallo Anna!", unnamed: "Hallo!" },
    verify: {
      subject: "Bestätige deine Adresse für Boop",
      title: "Fast geschafft",
      body: "Schön, dass du da bist. Bestätige noch kurz deine E-Mail-Adresse – dann kannst du loslegen und stempeln.",
      button: "Adresse bestätigen",
      footnote:
        "Du hast dich nicht bei Boop angemeldet? Dann ignoriere diese Mail einfach – ohne Bestätigung löschen wir die Anmeldung nach 30 Tagen.",
    },
    reset: {
      subject: "Ein neues Passwort für Boop",
      title: "Neues Passwort",
      body: "Jemand – hoffentlich du – möchte das Passwort für dein Boop-Konto ändern. Der Link gilt 1 Stunde.",
      button: "Neues Passwort wählen",
      footnote:
        "Das warst du nicht? Dann bleibt alles, wie es ist – dein Passwort ändert sich nur über den Link.",
    },
    inactive: {
      subject: "Wir vermissen dich bei Boop",
      title: "Lange nicht gesehen",
      body: "Wir haben dich lange nicht bei Boop gesehen. In 30 Tagen, ab dem 14. November 2026, löschen wir dein Konto – samt deinen Kalendern und Stempeln.",
      stay: "Einmal anmelden genügt, dann bleibt alles, wie es ist.",
      button: "Zu Boop",
      footnote:
        "Du magst Boop nicht mehr nutzen? Dann musst du nichts tun. Deine Daten kannst du vorher in der App unter „Konto“ herunterladen.",
    },
    invite: {
      subject: {
        named: "Anna lädt dich zu Boop ein",
        unnamed: "Boop lädt dich zu Boop ein",
      },
      title: "Du bist eingeladen!",
      body: "Anna möchte den Kalender „Sport <3 & Co“ mit dir teilen. Boop ist ein Stempelkalender: Ihr malt eure eigenen Stempel und stempelt eure Tage – zusammen.",
      valid: "Die Einladung gilt 14 Tage.",
      button: "Einladung ansehen",
      footnote:
        "Du kennst die Person nicht? Dann ignoriere diese Mail einfach – ohne Konto passiert nichts.",
    },
  },
  en: {
    hello: { named: "Hi Anna!", unnamed: "Hi!" },
    verify: {
      subject: "Confirm your address for Boop",
      title: "Almost there",
      body: "Lovely to have you. Just confirm your email address – then you're ready to start stamping.",
      button: "Confirm address",
      footnote:
        "You didn't sign up for Boop? Then simply ignore this mail – without confirmation we delete the sign-up after 30 days.",
    },
    reset: {
      subject: "A new password for Boop",
      title: "New password",
      body: "Someone – hopefully you – wants to change the password of your Boop account. The link is valid for 1 hour.",
      button: "Choose a new password",
      footnote:
        "Wasn't you? Then nothing changes – your password only changes through the link.",
    },
    inactive: {
      subject: "We miss you at Boop",
      title: "Long time no see",
      body: "We haven't seen you at Boop for a long time. In 30 days, from 14 November 2026, we'll delete your account – with your calendars and stamps.",
      stay: "Logging in once is enough, and everything stays as it is.",
      button: "Open Boop",
      footnote:
        "Don't want to use Boop anymore? Then you don't need to do anything. You can download your data first in the app under “Account”.",
    },
    invite: {
      subject: {
        named: "Anna invites you to Boop",
        unnamed: "Boop invites you to Boop",
      },
      title: "You're invited!",
      body: "Anna would like to share the calendar “Sport <3 & Co” with you. Boop is a stamp calendar: you draw your own stamps and stamp your days – together.",
      valid: "The invitation is valid for 14 days.",
      button: "See the invitation",
      footnote:
        "Don't know them? Then simply ignore this mail – nothing happens without an account.",
    },
  },
} as const;

const LOCALES = ["de", "en"] as const;
const NAMES = { named: "Anna", unnamed: "  " } as const;
const VARIANTS = ["named", "unnamed"] as const;

/** A request that holds the invitation it was asked to make, and the mail. */
const fakeRequest = () => {
  const made: Record<string, unknown>[] = [];
  const sent: { to: string; subject: string; html: string }[] = [];
  const payload = {
    delete: async () => ({ docs: [] }),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      made.push(data);
      return data;
    },
    findByID: async () => ({ name: "Sport <3 & Co" }),
    sendEmail: async (mail: { to: string; subject: string; html: string }) => {
      sent.push(mail);
    },
  };
  return { req: { payload } as unknown as PayloadRequest, made, sent };
};

describe("the mails, word for word as before", () => {
  for (const locale of LOCALES) {
    const was = WAS[locale];

    for (const variant of VARIANTS) {
      it(`confirming the address – ${locale}, ${variant}`, async () => {
        const user = { locale, name: NAMES[variant] };
        expect(await verifySubject(user)).toBe(was.verify.subject);
        expect(await verifyHtml({ token: TOKEN, user })).toBe(
          mailLayout({
            lang: locale,
            preheader: was.verify.body,
            title: was.verify.title,
            paragraphs: [was.hello[variant], was.verify.body],
            button: {
              label: was.verify.button,
              url: `${SITE}/${locale}/verify?token=a1b2%2Fc3%2Bd4`,
            },
            footnote: was.verify.footnote,
          })
        );
      });

      it(`before an unused account goes – ${locale}, ${variant}`, async () => {
        const user = { locale, name: NAMES[variant] };
        const mail = await inactiveMail({ user, deleteFrom: DELETE_FROM });
        const t = was.inactive;
        const url = `${SITE}/${locale}/app`;
        expect(mail.subject).toBe(t.subject);
        expect(mail.html).toBe(
          mailLayout({
            lang: locale,
            preheader: t.body,
            title: t.title,
            paragraphs: [was.hello[variant], t.body, t.stay],
            button: { label: t.button, url },
            footnote: t.footnote,
          })
        );
        expect(mail.text).toBe(
          [
            was.hello[variant],
            t.body,
            t.stay,
            `${t.button}: ${url}`,
            t.footnote,
          ].join("\n\n")
        );
      });
    }

    it(`a new password – ${locale}`, async () => {
      const user = { locale, name: "Anna" };
      expect(await resetSubject(user)).toBe(was.reset.subject);
      expect(await resetHtml({ token: TOKEN, user })).toBe(
        mailLayout({
          lang: locale,
          preheader: was.reset.body,
          title: was.reset.title,
          paragraphs: [was.reset.body],
          button: {
            label: was.reset.button,
            url: `${SITE}/${locale}/reset-password?token=a1b2%2Fc3%2Bd4`,
          },
          footnote: was.reset.footnote,
        })
      );
    });

    it(`the invitation – ${locale}`, async () => {
      const { req, made, sent } = fakeRequest();
      await invite(req, {
        email: "ben@example.com",
        calendar: "cal-1",
        from: { id: "acc-anna", name: "Anna", locale },
      });
      const token = String(made[0]?.token);
      const t = was.invite;
      expect(sent).toEqual([
        {
          to: "ben@example.com",
          subject: t.subject.named,
          html: mailLayout({
            lang: locale,
            preheader: t.body,
            title: t.title,
            paragraphs: [t.body, t.valid],
            button: {
              label: t.button,
              url: `${SITE}/${locale}/invite?token=${token}`,
            },
            footnote: t.footnote,
          }),
        },
      ]);
    });

    it(`the invitation from someone without a name – ${locale}`, async () => {
      const { req, sent } = fakeRequest();
      await invite(req, {
        email: "ben@example.com",
        calendar: "cal-1",
        from: { id: "acc-anna", name: "", locale },
      });
      expect(sent[0]?.subject).toBe(WAS[locale].invite.subject.unnamed);
    });
  }

  it("in German for an account without a language, or Payload's call without one", async () => {
    expect(await verifySubject({ locale: "fr" })).toBe(WAS.de.verify.subject);
    expect(await resetSubject(undefined)).toBe(WAS.de.reset.subject);
    expect(await resetHtml({})).toBe(
      mailLayout({
        lang: "de",
        preheader: WAS.de.reset.body,
        title: WAS.de.reset.title,
        paragraphs: [WAS.de.reset.body],
        button: {
          label: WAS.de.reset.button,
          url: `${SITE}/de/reset-password?token=`,
        },
        footnote: WAS.de.reset.footnote,
      })
    );
  });
});

describe("the mails with the CMS's words", () => {
  it("take them where they fit – placeholders filled, constants too", async () => {
    setTexts({
      de: {
        "mail.verify.subject": "Moin! Bestätige kurz deine Adresse",
        "mail.verify.hello.named": "Moin {name},",
        "mail.verify.footnote": "Nicht du? Nach {days} Tagen ist alles weg.",
        "mail.reset.body": "Der Link gilt eine Stunde.",
        "mail.inactive.body": "Ab dem {date} ist dein Konto weg.",
      },
      en: {
        "mail.invite.subject": "{from} saved you a seat at Boop",
        "mail.invite.body": "{from} shares “{calendar}” with you.",
        "mail.invite.valid": "Good for {days} days.",
      },
    });
    const anna = { locale: "de", name: "Anna" };

    expect(await verifySubject(anna)).toBe(
      "Moin! Bestätige kurz deine Adresse"
    );
    const verify = await verifyHtml({ token: TOKEN, user: anna });
    expect(verify).toContain("Moin Anna,");
    expect(verify).toContain("Nicht du? Nach 30 Tagen ist alles weg.");
    // Without a name: the code's wording, the CMS has none of its own.
    expect(
      await verifyHtml({ token: TOKEN, user: { locale: "de" } })
    ).toContain(">Hallo!<");
    // {hours} may go – the number is in the words then.
    expect(await resetHtml({ token: TOKEN, user: anna })).toContain(
      ">Der Link gilt eine Stunde.<"
    );

    const inactive = await inactiveMail({
      user: anna,
      deleteFrom: DELETE_FROM,
    });
    expect(inactive.text).toContain(
      "Ab dem 14. November 2026 ist dein Konto weg."
    );
    expect(inactive.html).toContain(
      "Ab dem 14. November 2026 ist dein Konto weg."
    );

    const { req, sent } = fakeRequest();
    await invite(req, {
      email: "ben@example.com",
      calendar: "cal-1",
      from: { id: "acc-anna", name: "Anna", locale: "en" },
    });
    expect(sent[0]?.subject).toBe("Anna saved you a seat at Boop");
    expect(sent[0]?.html).toContain(
      ">Anna shares “Sport &lt;3 &amp; Co” with you.<"
    );
    expect(sent[0]?.html).toContain(">Good for 14 days.<");
  });

  it("keep the code's where the CMS's don't fit", async () => {
    setTexts({
      de: {
        "mail.verify.hello.named": "Moin {vorname}!",
        "mail.inactive.body": "Dein Konto geht bald.",
        "mail.invite.subject": "   ",
      },
    });
    const anna = { locale: "de", name: "Anna" };
    expect(await verifyHtml({ token: TOKEN, user: anna })).toContain(
      ">Hallo Anna!<"
    );
    expect(
      (await inactiveMail({ user: anna, deleteFrom: DELETE_FROM })).text
    ).toContain(WAS.de.inactive.body);
    const { req, sent } = fakeRequest();
    await invite(req, {
      email: "ben@example.com",
      calendar: "cal-1",
      from: { id: "acc-anna", name: "Anna", locale: "de" },
    });
    expect(sent[0]?.subject).toBe(WAS.de.invite.subject.named);
  });
});

describe("the contact form's words", () => {
  // As they stood in the form before they moved (features/legal/contact-form.tsx).
  const WAS_CONTACT = {
    de: {
      intro:
        "Eine Frage, ein Wunsch oder ein Fehler, über den du gestolpert bist? Schreib mir einfach – ich antworte dir per E-Mail.",
      name: "Dein Name",
      email: "Deine E-Mail-Adresse",
      message: "Deine Nachricht",
      send: "Nachricht senden",
      sending: "Wird gesendet …",
      sent: "Danke für deine Nachricht! Ich melde mich, so schnell ich kann.",
      invalid:
        "Bitte gib deinen Namen, eine gültige E-Mail-Adresse und eine Nachricht an.",
      tooMany:
        "Das waren gerade ein paar Nachrichten zu viel. Versuch es in ein paar Minuten noch einmal.",
      offline: "Du bist offline – zum Senden brauchst du eine Verbindung.",
      failed:
        "Das hat leider nicht geklappt. Versuch es bitte später noch einmal.",
    },
    en: {
      intro:
        "A question, a wish or a bug you stumbled over? Just write to me – I'll answer by email.",
      name: "Your name",
      email: "Your email address",
      message: "Your message",
      send: "Send message",
      sending: "Sending …",
      sent: "Thanks for your message! I'll get back to you as soon as I can.",
      invalid: "Please fill in your name, a valid email address and a message.",
      tooMany:
        "That was a few messages too many just now. Please try again in a few minutes.",
      offline: "You're offline – sending needs a connection.",
      failed: "Sorry, that didn't work. Please try again later.",
    },
  };

  it("are the same as before, and the CMS's where it has them", () => {
    for (const locale of LOCALES) {
      expect(dictionaryOf(locale).contact).toEqual(WAS_CONTACT[locale]);
    }
    setTexts({ en: { "contact.sent": "Thanks – talk soon!" } });
    expect(dictionaryOf("en").contact.sent).toBe("Thanks – talk soon!");
    expect(dictionaryOf("de").contact.sent).toBe(WAS_CONTACT.de.sent);
  });
});

/** The leaf field at a stored path. */
const fieldAt = (fields: Field[], path: string): Field | undefined => {
  const [head, ...rest] = path.split(".");
  for (const field of fields) {
    if (field.type === "collapsible") {
      const found = fieldAt(field.fields, path);
      if (found) return found;
    } else if ("name" in field && field.name === head) {
      if (!rest.length) return field;
      if (field.type === "group") return fieldAt(field.fields, rest.join("."));
    }
  }
};

type Check = {
  validate: (value: unknown, options: { previousValue?: unknown }) => unknown;
  admin?: { description?: string };
};

describe("the mails and the contact form in the admin", () => {
  const fields = translationFields(
    TRANSLATION_KEYS,
    TRANSLATION_DEFAULTS,
    PLACEHOLDERS
  );

  it("are fields – every wording its own", () => {
    for (const key of [
      "contact.intro",
      "contact.tooMany",
      "mail.verify.subject",
      "mail.verify.hello.named",
      "mail.verify.hello.unnamed",
      "mail.reset.body",
      "mail.inactive.body",
      "mail.inactive.hello.unnamed",
      "mail.invite.subject",
      "mail.invite.valid",
    ]) {
      expect(TRANSLATION_KEYS).toContain(key);
      expect(fieldAt(fields, key)).toBeDefined();
    }
  });

  it("show the code's words with the placeholders, and keep them", () => {
    const body = fieldAt(fields, "mail.inactive.body") as unknown as Check;
    expect(body.admin?.description).toBe(
      "DE: Wir haben dich lange nicht bei Boop gesehen. In {days} Tagen, ab dem {date}, löschen wir dein Konto – samt deinen Kalendern und Stempeln.  ·  EN: We haven't seen you at Boop for a long time. In {days} days, from {date}, we'll delete your account – with your calendars and stamps.  ·  Keeps {date}  ·  May use {days}"
    );
    expect(body.validate("Ab dem {date} ist es weg.", {})).toBe(true);
    expect(body.validate("Bald ist es weg.", {})).toMatch("{date}");
    expect(body.validate("Ab dem {datum} ist es weg.", {})).toMatch("{datum}");

    const invited = fieldAt(fields, "mail.invite.body") as unknown as Check;
    expect(invited.admin?.description).toMatch("Keeps {from}, {calendar}");
    expect(invited.validate("{from} teilt etwas mit dir.", {})).toMatch(
      "{calendar}"
    );

    const reset = fieldAt(fields, "mail.reset.body") as unknown as Check;
    expect(reset.admin?.description).toMatch("May use {hours}");
    expect(reset.validate("Der Link gilt eine Stunde.", {})).toBe(true);

    const intro = fieldAt(fields, "contact.intro") as unknown as Check;
    expect(intro.validate("Schreib mir, {name}!", {})).toMatch(
      "no placeholders"
    );
  });
});
