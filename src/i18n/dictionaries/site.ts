import type { Shape } from "../flat";

/**
 * The site's own texts: the page's title and description for search and
 * sharing, the navigation, the landing page.
 */

const de = {
  meta: {
    title: "Boop – dein Doodle-Stempelkalender",
    short: "Boop",
    description:
      "Zeichne deine eigenen Stempel und boop sie auf deine Tage. Ein süßer Stempelkalender für dich, deine Freund:innen und deine Familie – auch offline.",
    keywords: [
      "Stempelkalender",
      "Doodle",
      "Kalender",
      "Habit Tracker",
      "Stimmungskalender",
      "geteilter Kalender",
      "Stempel zeichnen",
    ],
  },
  nav: {
    login: "Anmelden",
    register: "Konto erstellen",
    openApp: "Zur App",
    logoutInApp:
      "Ein paar Änderungen sind noch nicht abgeglichen – melde dich in der App ab.",
    legal: "Impressum & Datenschutz",
    home: "Boop – Startseite",
  },
  landing: {
    kicker: "Doodle-Stempelkalender",
    title: ["Jeder Tag verdient einen ", "Boop", "."],
    lead: "Zeichne deine eigenen kleinen Stempel, boop sie auf deine Tage und sieh zu, wie dein Jahr bunt wird. Allein oder zusammen mit deinen Liebsten.",
    cta: "Kostenlos loslegen",
    ctaApp: "Kalender öffnen",
    featuresTitle: "Was Boop kann",
    features: [
      {
        title: "Eigene Stempel",
        text: "Kritzel deinen Stempel selbst – eine Farbe, ein paar Striche, fertig. Ein Herz fürs Training, eine Wolke für Regentage.",
      },
      {
        title: "Boop auf jeden Tag",
        text: "Öffne einen Tag und setz so viele Stempel, wie du magst – verschieben, drehen, stapeln.",
      },
      {
        title: "Zusammen stempeln",
        text: "Teile Kalender mit Freund:innen oder der Familie. Alle stempeln mit, jede:r mit eigenen Stempeln.",
      },
      {
        title: "Auch offline",
        text: "Boop lässt sich wie eine App installieren und funktioniert ohne Netz. Sobald du wieder online bist, wird alles abgeglichen.",
      },
    ],
    howTitle: "So einfach geht's",
    how: [
      "Konto erstellen und E-Mail bestätigen.",
      "Deinen ersten Stempel zeichnen.",
      "Einen Tag antippen – boop!",
    ],
    closing: "Bereit für deinen ersten Boop?",
  },
};

const en: Shape<typeof de> = {
  meta: {
    title: "Boop – your doodle stamp calendar",
    short: "Boop",
    description:
      "Draw your own stamps and boop them onto your days. A cute stamp calendar for you, your friends and your family – offline too.",
    keywords: [
      "stamp calendar",
      "doodle",
      "calendar",
      "habit tracker",
      "mood calendar",
      "shared calendar",
      "draw stamps",
    ],
  },
  nav: {
    login: "Log in",
    register: "Create account",
    openApp: "Open the app",
    logoutInApp: "A few changes aren't synced yet – log out in the app.",
    legal: "Imprint & privacy",
    home: "Boop – home",
  },
  landing: {
    kicker: "Doodle stamp calendar",
    title: ["Every day deserves a ", "boop", "."],
    lead: "Draw your own little stamps, boop them onto your days and watch your year fill with color. On your own or together with your favorite people.",
    cta: "Start for free",
    ctaApp: "Open calendar",
    featuresTitle: "What Boop does",
    features: [
      {
        title: "Your own stamps",
        text: "Doodle your stamp yourself – one color, a few lines, done. A heart for workouts, a cloud for rainy days.",
      },
      {
        title: "Boop every day",
        text: "Open a day and place as many stamps as you like – move them, turn them, stack them.",
      },
      {
        title: "Stamp together",
        text: "Share calendars with friends or family. Everyone stamps along, each with their own stamps.",
      },
      {
        title: "Offline too",
        text: "Install Boop like an app and use it without a connection. Once you're back online, everything syncs.",
      },
    ],
    howTitle: "How it works",
    how: [
      "Create an account and confirm your email.",
      "Draw your first stamp.",
      "Tap a day – boop!",
    ],
    closing: "Ready for your first boop?",
  },
};

export const siteTexts = { de, en };
