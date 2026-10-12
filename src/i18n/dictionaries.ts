import type { Locale } from "./config";

/**
 * Every text of the site and the app, per language. German is the shape;
 * English must have the same keys (checked by the type below).
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
  auth: {
    name: "Wie sollen wir dich nennen?",
    email: "E-Mail-Adresse",
    password: "Passwort",
    newPassword: "Neues Passwort",
    passwordHint: "Mindestens 8 Zeichen.",
    working: "Einen Moment …",
    failed: "Das hat nicht geklappt. Versuch es bitte noch einmal.",
    offline: "Du bist offline – dafür brauchst du eine Verbindung.",
    login: {
      title: "Willkommen zurück",
      submit: "Anmelden",
      noAccount: "Noch kein Konto?",
      forgot: "Passwort vergessen?",
      wrong: "E-Mail oder Passwort stimmen nicht.",
      unverified:
        "Bitte bestätige zuerst deine E-Mail-Adresse – schau in dein Postfach.",
      locked:
        "Zu viele Versuche. Warte ein paar Minuten oder setz dein Passwort zurück.",
    },
    register: {
      title: "Konto erstellen",
      submit: "Konto erstellen",
      haveAccount: "Schon ein Konto?",
      privacy: "Mit dem Konto gelten unsere Hinweise zum Datenschutz.",
      doneTitle: "Schau in dein Postfach!",
      doneText:
        "Wir haben dir eine Mail geschickt. Bestätige darin deine Adresse, dann kannst du dich anmelden.",
      taken: "Mit dieser Adresse gibt es schon ein Konto.",
      tooMany: "Zu viele Anmeldungen von hier – versuch es später noch einmal.",
    },
    forgot: {
      title: "Passwort vergessen",
      text: "Gib deine Adresse ein – wir schicken dir einen Link für ein neues Passwort.",
      submit: "Link schicken",
      doneTitle: "Unterwegs!",
      doneText:
        "Wenn es ein Konto mit dieser Adresse gibt, ist der Link jetzt in deinem Postfach. Er gilt eine Stunde.",
    },
    reset: {
      title: "Neues Passwort",
      submit: "Passwort speichern",
      invalid:
        "Der Link ist abgelaufen oder wurde schon benutzt. Fordere einfach einen neuen an.",
    },
    invite: {
      title: "Du bist eingeladen!",
      text: (from: string, calendar: string) =>
        `${from} möchte den Kalender „${calendar}“ mit dir teilen.`,
      accept: "Einladung annehmen",
      account:
        "Erstell ein kostenloses Konto oder melde dich an – dann bist du dabei.",
      invalid:
        "Diese Einladung gibt es nicht mehr. Frag einfach nach einer neuen.",
    },
    verify: {
      title: "Adresse bestätigen",
      working: "Wir bestätigen deine Adresse …",
      done: "Geschafft – deine Adresse ist bestätigt!",
      failed:
        "Der Link ist ungültig oder wurde schon benutzt. Vielleicht ist deine Adresse schon bestätigt?",
      toLogin: "Zur Anmeldung",
    },
  },
  app: {
    loading: "Boop lädt …",
    hello: (name: string) => (name ? `Hallo ${name}!` : "Hallo!"),
    lead: "Welcher Tag bekommt heute einen Boop?",
    online: "Online",
    offline: "Offline – wir gleichen ab, sobald du wieder Netz hast",
    syncing: "Gleiche ab …",
    pending: (n: number) =>
      n === 1 ? "1 Änderung wartet" : `${n} Änderungen warten`,
    synced: "Alles abgeglichen",
    notLoggedIn: "Bitte melde dich an.",
    offlineNoAccount:
      "Du bist offline. Melde dich einmal mit Verbindung an – danach klappt Boop auch ohne Netz.",
    calendars: "Kalender",
    newCalendar: "Neuer Kalender",
    newCalendarName: "Name des Kalenders",
    calendarPlaceholder: "z. B. Familie, Sport, Reise …",
    create: "Anlegen",
    rename: "Umbenennen",
    deleteCalendar: "Kalender löschen",
    deleteCalendarConfirm: (name: string) =>
      `„${name}“ mit allen Stempeln darauf löschen? Das lässt sich nicht rückgängig machen.`,
    stamps: "Deine Stempel",
    noStamps: "Noch keine Stempel – mal deinen ersten!",
    newStamp: "Stempel malen",
    today: "Heute",
    prev: "Vorheriger Monat",
    next: "Nächster Monat",
    months: [
      "Januar",
      "Februar",
      "März",
      "April",
      "Mai",
      "Juni",
      "Juli",
      "August",
      "September",
      "Oktober",
      "November",
      "Dezember",
    ],
    weekdays: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
    draw: {
      title: "Stempel malen",
      name: "Name (optional)",
      namePlaceholder: "z. B. Sport, Regentag, Kuss …",
      color: "Farbe",
      shape: "Form",
      shapes: {
        circle: "Rund",
        square: "Eckig",
        octagon: "Achteck",
        triangle: "Dreieck",
        diamond: "Raute",
      },
      undo: "Zurück",
      clear: "Leeren",
      upload: "SVG hochladen",
      inverted: "Invertiert (ausgeschnitten)",
      uploadFailed: "Mit dieser Datei kann ich nichts anfangen.",
      save: "Stempel speichern",
      cancel: "Abbrechen",
      back: "Weiter malen",
      shared: "Die anderen in diesem Kalender dürfen auch damit stempeln",
      hint: "Mal hier drauf!",
      make3d: "Fertig – mach ihn 3D",
      done: "Ta-da! Dein Stempel",
      turn: "Zum Drehen ziehen",
    },
    day: {
      empty: "Noch nichts los – wähl unten einen Stempel und tipp auf den Tag.",
      tray: "Stempel antippen, dann auf den Tag tippen",
      held: "Tipp auf den Tag – oder tunk ihn in ein Stempelkissen.",
      wheel: "Das Mausrad dreht den Stempel.",
      turnLeft: "Nach links drehen",
      turnRight: "Nach rechts drehen",
      inHand: "In der Hand",
      remove: "Abdruck entfernen",
      undo: "Rückgängig",
      close: "Fertig",
      print: "Abdruck",
      ink: "Stempelkissen",
    },
    share: {
      title: "Teilen",
      text: "Lade Leute per E-Mail ein. Ohne Boop-Konto bekommen sie eine Einladung.",
      email: "E-Mail-Adresse",
      add: "Einladen",
      added: (name: string) => `${name} ist jetzt dabei.`,
      invited: (email: string) =>
        `Einladung an ${email} verschickt – sobald es ein Konto gibt, ist die Person dabei.`,
      invitesTitle: "Eingeladen",
      revoke: "Zurückziehen",
      notFound: "Das hat nicht geklappt.",
      members: "Dabei",
      owner: "Besitzer:in",
      remove: "Entfernen",
      leave: "Kalender verlassen",
    },
    stamp: {
      untitled: "Stempel",
      by: (name: string) => `Von ${name}`,
      shared: "Geteilt",
      share: "Teilen",
      shareText:
        "Er bleibt dein Stempel. Wer in einem angekreuzten Kalender ist, darf auch damit stempeln.",
      shareNone:
        "Teile zuerst einen Kalender – dann kannst du dort auch deine Stempel teilen.",
      onlyYou: "Bisher nur du",
      print3d: "Für den 3D-Drucker (STL)",
      hint: (mm: number) =>
        `${mm} mm breit, mit „boop“ auf dem Rücken. Die Stempelfläche ist gespiegelt – so kommt dein Abdruck richtig herum raus.`,
      delete: "Stempel löschen",
      deleteConfirm:
        "Diesen Stempel löschen? Auch seine Abdrücke verschwinden.",
    },
    account: "Konto",
    logout: "Abmelden",
    logoutOffline: "Zum Abmelden brauchst du eine Verbindung.",
    logoutPending: (n: number) =>
      `${n === 1 ? "1 Änderung ist" : `${n} Änderungen sind`} noch nicht abgeglichen und gehen beim Abmelden verloren.`,
  },
};

export type Dictionary = typeof de;

/** Same keys as German; the values may differ (strings, functions, lists). */
type Shape<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => R
  : T extends readonly (infer U)[]
    ? Shape<U>[]
    : T extends object
      ? { [K in keyof T]: Shape<T[K]> }
      : T extends string
        ? string
        : T;

const en: Shape<Dictionary> = {
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
  auth: {
    name: "What should we call you?",
    email: "Email address",
    password: "Password",
    newPassword: "New password",
    passwordHint: "At least 8 characters.",
    working: "One moment …",
    failed: "That didn't work. Please try again.",
    offline: "You're offline – this needs a connection.",
    login: {
      title: "Welcome back",
      submit: "Log in",
      noAccount: "No account yet?",
      forgot: "Forgot your password?",
      wrong: "Email or password don't match.",
      unverified: "Please confirm your email address first – check your inbox.",
      locked: "Too many tries. Wait a few minutes or reset your password.",
    },
    register: {
      title: "Create account",
      submit: "Create account",
      haveAccount: "Already have an account?",
      privacy: "Our privacy notes apply to your account.",
      doneTitle: "Check your inbox!",
      doneText:
        "We've sent you a mail. Confirm your address there, then you can log in.",
      taken: "There's already an account with this address.",
      tooMany: "Too many sign-ups from here – please try again later.",
    },
    forgot: {
      title: "Forgot password",
      text: "Enter your address – we'll send you a link for a new password.",
      submit: "Send link",
      doneTitle: "On its way!",
      doneText:
        "If there's an account with this address, the link is in your inbox now. It's valid for one hour.",
    },
    reset: {
      title: "New password",
      submit: "Save password",
      invalid:
        "The link has expired or was already used. Simply ask for a new one.",
    },
    invite: {
      title: "You're invited!",
      text: (from: string, calendar: string) =>
        `${from} would like to share the calendar “${calendar}” with you.`,
      accept: "Accept invitation",
      account: "Create a free account or log in – and you're in.",
      invalid: "This invitation doesn't exist anymore. Just ask for a new one.",
    },
    verify: {
      title: "Confirm address",
      working: "Confirming your address …",
      done: "Done – your address is confirmed!",
      failed:
        "The link is invalid or was already used. Maybe your address is confirmed already?",
      toLogin: "Go to log in",
    },
  },
  app: {
    loading: "Boop is loading …",
    hello: (name: string) => (name ? `Hi ${name}!` : "Hi!"),
    lead: "Which day gets a boop today?",
    online: "Online",
    offline: "Offline – we'll sync once you're back online",
    syncing: "Syncing …",
    pending: (n: number) =>
      n === 1 ? "1 change waiting" : `${n} changes waiting`,
    synced: "All synced",
    notLoggedIn: "Please log in.",
    offlineNoAccount:
      "You're offline. Log in once with a connection – after that Boop works offline too.",
    calendars: "Calendars",
    newCalendar: "New calendar",
    newCalendarName: "Calendar name",
    calendarPlaceholder: "e.g. family, workouts, trip …",
    create: "Create",
    rename: "Rename",
    deleteCalendar: "Delete calendar",
    deleteCalendarConfirm: (name: string) =>
      `Delete “${name}” with all its stamps? This can't be undone.`,
    stamps: "Your stamps",
    noStamps: "No stamps yet – draw your first one!",
    newStamp: "Draw a stamp",
    today: "Today",
    prev: "Previous month",
    next: "Next month",
    months: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    draw: {
      title: "Draw a stamp",
      name: "Name (optional)",
      namePlaceholder: "e.g. workout, rainy day, kiss …",
      color: "Color",
      shape: "Shape",
      shapes: {
        circle: "Round",
        square: "Square",
        octagon: "Octagon",
        triangle: "Triangle",
        diamond: "Diamond",
      },
      undo: "Undo",
      clear: "Clear",
      upload: "Upload SVG",
      inverted: "Inverted (cut out)",
      uploadFailed: "I can't make anything of this file.",
      save: "Save stamp",
      cancel: "Cancel",
      back: "Keep drawing",
      shared: "The others in this calendar may stamp with it too",
      hint: "Draw on here!",
      make3d: "Done – make it 3D",
      done: "Ta-da! Your stamp",
      turn: "Drag to turn it",
    },
    day: {
      empty: "Nothing here yet – pick a stamp below and tap the day.",
      tray: "Tap a stamp, then tap the day",
      held: "Tap the day – or dip it into an ink pad.",
      wheel: "Scroll to turn the stamp.",
      turnLeft: "Turn left",
      turnRight: "Turn right",
      inHand: "In your hand",
      remove: "Remove print",
      undo: "Undo",
      close: "Done",
      print: "Print",
      ink: "Ink pad",
    },
    share: {
      title: "Share",
      text: "Invite people by email. Without a Boop account they get an invitation.",
      email: "Email address",
      add: "Invite",
      added: (name: string) => `${name} is in now.`,
      invited: (email: string) =>
        `Invitation sent to ${email} – they're in once they have an account.`,
      invitesTitle: "Invited",
      revoke: "Take back",
      notFound: "That didn't work.",
      members: "Members",
      owner: "Owner",
      remove: "Remove",
      leave: "Leave calendar",
    },
    stamp: {
      untitled: "Stamp",
      by: (name: string) => `By ${name}`,
      shared: "Shared",
      share: "Share",
      shareText:
        "It stays your stamp. Everyone in a calendar you tick may stamp with it too.",
      shareNone:
        "Share a calendar first – then you can share your stamps there, too.",
      onlyYou: "Just you so far",
      print3d: "For the 3D printer (STL)",
      hint: (mm: number) =>
        `${mm} mm wide, with “boop” on its back. The stamp face is mirrored – so your print comes out the right way round.`,
      delete: "Delete stamp",
      deleteConfirm: "Delete this stamp? Its prints go too.",
    },
    account: "Account",
    logout: "Log out",
    logoutOffline: "Logging out needs a connection.",
    logoutPending: (n: number) =>
      `${n === 1 ? "1 change isn't" : `${n} changes aren't`} synced yet and will be lost when you log out.`,
  },
};

const dictionaries = { de, en: en as Dictionary } satisfies Record<
  Locale,
  Dictionary
>;

export const dictionaryOf = (locale: Locale): Dictionary =>
  dictionaries[locale];
