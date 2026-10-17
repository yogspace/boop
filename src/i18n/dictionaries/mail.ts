import {
  EMAIL_CHANGE_HOURS,
  UNVERIFIED_DAYS,
  WARNING_DAYS,
} from "../../features/accounts/retention";
import { INVITE_DAYS } from "../../features/calendar/invite-expiry";
import type { Shape } from "../flat";
import { template } from "../template";

/**
 * The mails – in the account's language (features/accounts/emails.ts),
 * the invitation in the sender's (features/calendar/invites.ts).
 */

const de = {
  mail: {
    verify: {
      subject: "Bestätige deine Adresse für Boop",
      hello: template(
        { named: "Hallo {name}!", unnamed: "Hallo!" },
        (say) => (name: string | null) =>
          name ? say.named({ name }) : say.unnamed()
      ),
      title: "Fast geschafft",
      body: "Schön, dass du da bist. Bestätige noch kurz deine E-Mail-Adresse – dann kannst du loslegen und stempeln.",
      button: "Adresse bestätigen",
      footnote: template(
        "Du hast dich nicht bei Boop angemeldet? Dann ignoriere diese Mail einfach – ohne Bestätigung löschen wir die Anmeldung nach {days} Tagen.",
        (say) => say({ days: UNVERIFIED_DAYS }),
        { optional: ["days"] }
      ),
    },
    reset: {
      subject: "Ein neues Passwort für Boop",
      title: "Neues Passwort",
      // The hours come with the mail: the collection sets them (accounts/
      // emails.ts).
      body: template(
        "Jemand – hoffentlich du – möchte das Passwort für dein Boop-Konto ändern. Der Link gilt {hours} Stunde.",
        (say) => (hours: number) => say({ hours }),
        { optional: ["hours"] }
      ),
      button: "Neues Passwort wählen",
      footnote:
        "Das warst du nicht? Dann bleibt alles, wie es ist – dein Passwort ändert sich nur über den Link.",
    },
    // To a new address the account asked for: its link confirms it.
    newEmail: {
      subject: "Bestätige deine neue Adresse für Boop",
      hello: template(
        { named: "Hallo {name}!", unnamed: "Hallo!" },
        (say) => (name: string | null) =>
          name ? say.named({ name }) : say.unnamed()
      ),
      title: "Neue Adresse",
      body: template(
        "Du möchtest dich bei Boop künftig mit dieser Adresse anmelden. Bestätige sie kurz – der Link gilt {hours} Stunden. Bis dahin bleibt deine bisherige Adresse.",
        (say) => say({ hours: EMAIL_CHANGE_HOURS }),
        { optional: ["hours"] }
      ),
      button: "Neue Adresse bestätigen",
      footnote:
        "Das warst du nicht? Dann ignoriere diese Mail einfach – ohne Bestätigung ändert sich nichts.",
    },
    // To the address it had, once the new one counts – the button leads to
    // the contact form.
    emailChanged: {
      subject: "Deine Adresse bei Boop wurde geändert",
      hello: template(
        { named: "Hallo {name}!", unnamed: "Hallo!" },
        (say) => (name: string | null) =>
          name ? say.named({ name }) : say.unnamed()
      ),
      title: "Adresse geändert",
      body: "Dein Boop-Konto hat jetzt eine neue E-Mail-Adresse. Diese hier gilt dafür nicht mehr – angemeldet wird ab sofort mit der neuen.",
      notYou:
        "Das warst du nicht? Dann melde dich bitte gleich bei uns – über das Kontaktformular.",
      button: "Zum Kontaktformular",
      footnote:
        "Du bekommst diese Mail, weil diese Adresse bis eben zu einem Boop-Konto gehörte.",
    },
    inactive: {
      subject: "Wir vermissen dich bei Boop",
      hello: template(
        { named: "Hallo {name}!", unnamed: "Hallo!" },
        (say) => (name: string | null) =>
          name ? say.named({ name }) : say.unnamed()
      ),
      title: "Lange nicht gesehen",
      body: template(
        "Wir haben dich lange nicht bei Boop gesehen. In {days} Tagen, ab dem {date}, löschen wir dein Konto – samt deinen Kalendern und Stempeln.",
        (say) => (date: string) => say({ days: WARNING_DAYS, date }),
        { optional: ["days"] }
      ),
      stay: "Einmal anmelden genügt, dann bleibt alles, wie es ist.",
      button: "Zu Boop",
      footnote:
        "Du magst Boop nicht mehr nutzen? Dann musst du nichts tun. Deine Daten kannst du vorher in der App unter „Konto“ herunterladen.",
    },
    invite: {
      subject: template(
        "{from} lädt dich zu Boop ein",
        (say) => (from: string) => say({ from })
      ),
      title: "Du bist eingeladen!",
      body: template(
        "{from} möchte den Kalender „{calendar}“ mit dir teilen. Boop ist ein Stempelkalender: Ihr malt eure eigenen Stempel und stempelt eure Tage – zusammen.",
        (say) => (from: string, calendar: string) => say({ from, calendar })
      ),
      valid: template(
        "Die Einladung gilt {days} Tage.",
        (say) => say({ days: INVITE_DAYS }),
        { optional: ["days"] }
      ),
      button: "Einladung ansehen",
      footnote:
        "Du kennst die Person nicht? Dann ignoriere diese Mail einfach – ohne dein Ja passiert nichts.",
    },
  },
};

const en: Shape<typeof de> = {
  mail: {
    verify: {
      subject: "Confirm your address for Boop",
      hello: { named: "Hi {name}!", unnamed: "Hi!" },
      title: "Almost there",
      body: "Lovely to have you. Just confirm your email address – then you're ready to start stamping.",
      button: "Confirm address",
      footnote:
        "You didn't sign up for Boop? Then simply ignore this mail – without confirmation we delete the sign-up after {days} days.",
    },
    reset: {
      subject: "A new password for Boop",
      title: "New password",
      body: "Someone – hopefully you – wants to change the password of your Boop account. The link is valid for {hours} hour.",
      button: "Choose a new password",
      footnote:
        "Wasn't you? Then nothing changes – your password only changes through the link.",
    },
    newEmail: {
      subject: "Confirm your new address for Boop",
      hello: { named: "Hi {name}!", unnamed: "Hi!" },
      title: "New address",
      body: "You'd like to log in to Boop with this address from now on. Just confirm it – the link is valid for {hours} hours. Until then your old address stays.",
      button: "Confirm new address",
      footnote:
        "Wasn't you? Then simply ignore this mail – nothing changes without confirmation.",
    },
    emailChanged: {
      subject: "Your address at Boop was changed",
      hello: { named: "Hi {name}!", unnamed: "Hi!" },
      title: "Address changed",
      body: "Your Boop account has a new email address now. This one no longer counts for it – logging in works with the new one from now on.",
      notYou:
        "Wasn't you? Then please get in touch right away – through the contact form.",
      button: "To the contact form",
      footnote:
        "You're getting this mail because this address belonged to a Boop account until just now.",
    },
    inactive: {
      subject: "We miss you at Boop",
      hello: { named: "Hi {name}!", unnamed: "Hi!" },
      title: "Long time no see",
      body: "We haven't seen you at Boop for a long time. In {days} days, from {date}, we'll delete your account – with your calendars and stamps.",
      stay: "Logging in once is enough, and everything stays as it is.",
      button: "Open Boop",
      footnote:
        "Don't want to use Boop anymore? Then you don't need to do anything. You can download your data first in the app under “Account”.",
    },
    invite: {
      subject: "{from} invites you to Boop",
      title: "You're invited!",
      body: "{from} would like to share the calendar “{calendar}” with you. Boop is a stamp calendar: you draw your own stamps and stamp your days – together.",
      valid: "The invitation is valid for {days} days.",
      button: "See the invitation",
      footnote:
        "Don't know them? Then simply ignore this mail – nothing happens unless you say yes.",
    },
  },
};

export const mailTexts = { de, en };
