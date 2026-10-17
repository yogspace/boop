import { EMAIL_CHANGE_HOURS } from "../../features/accounts/retention";
import type { Shape } from "../flat";
import { template } from "../template";

/** The account sheet, and logging out. */

const de = {
  account: "Konto",
  accountSheet: {
    title: "Konto",
    // The sheet's parts, each under its own heading.
    profile: "Profil",
    device: "App",
    language: "Sprache",
    sync: "Abgleich",
    name: "Dein Name – so sehen dich die anderen",
    nameFailed:
      "Der Name ließ sich nicht speichern. Versuch es bitte noch einmal.",
    email: template(
      "Angemeldet als {email}",
      (say) => (email: string) => say({ email })
    ),
    // A new address – it counts once confirmed (accounts/email-change.ts).
    emailChange: "Ändern",
    emailNew: "Neue E-Mail-Adresse",
    emailHint: template(
      "Wir schicken dir einen Link an die neue Adresse. Du hast {hours} Stunden Zeit, ihn zu öffnen.",
      (say) => say({ hours: EMAIL_CHANGE_HOURS }),
      { optional: ["hours"] }
    ),
    emailSend: "Link schicken",
    emailSame: "Das ist schon deine Adresse.",
    emailInvalid: "Das ist keine E-Mail-Adresse.",
    emailPending: template(
      "Wir haben dir eine Mail an {pending} geschickt. Bis du bestätigst, bleibt {email} deine Adresse.",
      (say) => (pending: string, email: string) => say({ pending, email })
    ),
    emailCancel: "Doch nicht ändern",
    // Only where an admin ticked the account's box in the CMS.
    cms: "CMS öffnen",
    stored:
      "Bei Boop liegen dein Name, deine E-Mail-Adresse und was du anlegst: Kalender, Stempel, Abdrücke und Notizen – und, wenn du sie einschaltest, deine Geräte für Benachrichtigungen.",
    privacy: "Mehr im Datenschutz",
    exportTitle: "Deine Daten",
    exportText:
      "Dein Konto, deine Kalender, Stempel, Abdrücke, Notizen, Einladungen und Benachrichtigungen in einer Datei (JSON).",
    export: "Daten herunterladen",
    exportFailed:
      "Das Herunterladen hat nicht geklappt. Versuch es bitte noch einmal.",
    delete: "Konto löschen",
    deleteLead:
      "Das lässt sich nicht rückgängig machen. Für immer weg sind dann:",
    deleteGone: [
      "deine Kalender mit allen Abdrücken und Notizen – auch für alle, mit denen du sie teilst",
      "deine Stempel und ihre Abdrücke, auch in den Kalendern anderer",
      "alles, was du in den Kalendern anderer gestempelt hast – deine Notizen dort bleiben, ohne deinen Namen",
      "dein Konto selbst, die Einladungen, die du verschickt hast, und deine Benachrichtigungen",
    ],
    deleteTip: "Magst du etwas behalten? Dann lad vorher deine Daten herunter.",
    password: "Zur Sicherheit: dein Passwort",
    deleteForGood: "Konto endgültig löschen",
    wrongPassword: "Das Passwort stimmt nicht.",
    tooMany: "Zu viele Versuche. Warte ein paar Minuten.",
  },
  logout: "Abmelden",
  logoutOffline: "Zum Abmelden brauchst du eine Verbindung.",
  logoutPending: template(
    {
      one: "1 Änderung ist noch nicht abgeglichen und geht beim Abmelden verloren.",
      many: "{n} Änderungen sind noch nicht abgeglichen und gehen beim Abmelden verloren.",
    },
    (say) => (n: number) => (n === 1 ? say.one() : say.many({ n }))
  ),
};

const en: Shape<typeof de> = {
  account: "Account",
  accountSheet: {
    title: "Account",
    profile: "Profile",
    device: "App",
    language: "Language",
    sync: "Sync",
    name: "Your name – how the others see you",
    nameFailed: "The name couldn't be saved. Please try again.",
    email: "Logged in as {email}",
    emailChange: "Change",
    emailNew: "New email address",
    emailHint:
      "We'll send a link to the new address. You have {hours} hours to open it.",
    emailSend: "Send link",
    emailSame: "That's your address already.",
    emailInvalid: "That's not an email address.",
    emailPending:
      "We've sent a mail to {pending}. Until you confirm, {email} stays your address.",
    emailCancel: "Don't change it",
    cms: "Open CMS",
    stored:
      "Boop keeps your name, your email address and what you make: calendars, stamps, prints and notes – and, once you turn them on, your devices for notifications.",
    privacy: "More in the privacy notes",
    exportTitle: "Your data",
    exportText:
      "Your account, calendars, stamps, prints, notes, invitations and notification settings in one file (JSON).",
    export: "Download data",
    exportFailed: "The download didn't work. Please try again.",
    delete: "Delete account",
    deleteLead: "This can't be undone. Gone for good are then:",
    deleteGone: [
      "your calendars with all their prints and notes – for everyone you share them with, too",
      "your stamps and their prints, in other people's calendars too",
      "everything you stamped in other people's calendars – your notes there stay, without your name",
      "your account itself, the invitations you sent and your notifications",
    ],
    deleteTip: "Want to keep something? Then download your data first.",
    password: "To be safe: your password",
    deleteForGood: "Delete account for good",
    wrongPassword: "That's not the password.",
    tooMany: "Too many tries. Wait a few minutes.",
  },
  logout: "Log out",
  logoutOffline: "Logging out needs a connection.",
  logoutPending: {
    one: "1 change isn't synced yet and will be lost when you log out.",
    many: "{n} changes aren't synced yet and will be lost when you log out.",
  },
};

export const accountTexts = { de, en };
