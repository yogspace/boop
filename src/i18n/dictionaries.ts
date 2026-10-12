import { INVITE_DAYS } from "../features/calendar/invite-expiry";
import type { Locale } from "./config";

/**
 * Every text of the site and the app, per language. German is the shape;
 * English must have the same keys (checked by the type below). Not here:
 * the stamp colors' names – they come with the colors, from the CMS
 * (features/calendar/palette.ts).
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
      remember: "Angemeldet bleiben",
      rememberOff:
        "Ohne Haken bist du abgemeldet, sobald du den Browser schließt – spätestens nach einem Tag.",
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
      until: (date: string) => `Die Einladung gilt bis zum ${date} Uhr.`,
      accept: "Einladung annehmen",
      account:
        "Erstell ein kostenloses Konto oder melde dich an – dann bist du dabei.",
      expiredTitle: "Einladung abgelaufen",
      expired: (from: string) =>
        `Einladungen gelten ${INVITE_DAYS} Tage – diese ist leider abgelaufen. ${from ? `Frag ${from}` : "Frag"} einfach nach einer neuen.`,
      invalid: `Diese Einladung gibt es nicht mehr – sie wurde schon benutzt, zurückgezogen oder ist nach ${INVITE_DAYS} Tagen abgelaufen. Frag einfach nach einer neuen.`,
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
    offline: "Offline – wir gleichen ab, sobald du wieder Netz hast",
    syncing: "Gleiche ab …",
    pending: (n: number) =>
      n === 1 ? "1 Änderung wartet" : `${n} Änderungen warten`,
    synced: "Alles abgeglichen",
    sync: {
      synced:
        "Alles liegt sicher auf dem Server – auch für deine anderen Geräte.",
      syncing: "Deine Änderungen sind gerade unterwegs.",
      pending: "Sie liegen sicher auf deinem Gerät und gehen gleich raus.",
      offline: "Boop geht trotzdem weiter – nichts geht verloren.",
      offlineTitle: "Offline",
      how: "Boop speichert alles zuerst auf deinem Gerät und schickt es los, sobald Netz da ist: gleich nach jeder Änderung, wenn du wieder online bist, beim Öffnen und alle 30 Sekunden.",
      now: "Jetzt abgleichen",
    },
    offlineNoAccount:
      "Du bist offline. Melde dich einmal mit Verbindung an – danach klappt Boop auch ohne Netz.",
    calendars: "Kalender",
    newCalendar: "Neuer Kalender",
    newCalendarName: "Name des Kalenders",
    calendarPlaceholder: "z. B. Familie, Sport, Reise …",
    create: "Anlegen",
    deleteCalendar: "Kalender löschen",
    deleteCalendarConfirm: (name: string) =>
      `„${name}“ mit allen Stempeln darauf löschen? Das lässt sich nicht rückgängig machen.`,
    noCalendar: "Noch kein Kalender – leg einen an, dann geht's los.",
    stamps: "Deine Stempel",
    noStamps: "Noch keine Stempel – mal deinen ersten!",
    newStamp: "Neuer Stempel",
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
      title: "Neuer Stempel",
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
      redo: "Wiederholen",
      clear: "Leeren",
      width: "Strichstärke",
      widths: { thin: "Fein", medium: "Mittel", thick: "Dick" },
      upload: "SVG hochladen",
      inverted: "Invertiert (ausgeschnitten)",
      special: "Special – größer & glitzert",
      rim: "Rahmen",
      rims: {
        plain: "Glatt",
        dashed: "Gestrichelt",
        dotted: "Gepunktet",
        wave: "Welle",
        zigzag: "Zacken",
        scallop: "Bögen",
        double: "Doppelt",
      },
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
      picked: "Abdruck markiert.",
      pickedKeys: "Entf oder ⌫ entfernt ihn.",
      remove: "Abdruck entfernen",
      undo: "Rückgängig",
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
        `Einladung an ${email} verschickt – sie gilt ${INVITE_DAYS} Tage. Sobald es ein Konto gibt, ist die Person dabei.`,
      invitesTitle: "Eingeladen",
      revoke: "Zurückziehen",
      notFound: "Das hat nicht geklappt.",
      members: "Dabei",
      owner: "Besitzer:in",
      remove: "Entfernen",
      leave: "Kalender verlassen",
      leaveAsk: (owner: string) =>
        `Wirklich verlassen? Du siehst ihn dann nicht mehr – zurück kommst du nur, wenn ${owner} dich wieder einlädt.`,
      leaveYes: "Ja, verlassen",
    },
    save: "Speichern",
    settings: {
      title: "Einstellungen",
      shared: {
        title: "Für alle",
        owner:
          "Der Kalender selbst – was du hier änderst, ändert sich für alle darin.",
        member: (name: string) =>
          `Der Kalender selbst – das legt ${name} fest.`,
      },
      own: {
        title: "Nur für dich",
        text: "Das stellt jede:r für sich ein.",
        colorOwner: "Deine Farbe. Wer selbst keine wählt, sieht sie auch.",
        colorMember:
          "Nur bei dir, auf diesem Gerät – die anderen sehen ihre eigene Farbe.",
        colorReset: "Wie der Kalender",
      },
      deleteShared: (others: number) =>
        others === 1
          ? "Er ist dann auch für die andere Person weg."
          : `Er ist dann auch für die ${others} anderen weg.`,
      deleteNext: "Ja, weg damit",
      deleteType: (name: string) =>
        `Ganz sicher? Dann tipp zur Bestätigung seinen Namen ein: ${name}`,
      deleteForGood: "Endgültig löschen",
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
    accountSheet: {
      title: "Konto",
      name: "Dein Name – so sehen dich die anderen",
      nameFailed:
        "Der Name ließ sich nicht speichern. Versuch es bitte noch einmal.",
      email: (email: string) => `Angemeldet als ${email}`,
      stored:
        "Bei Boop liegen dein Name, deine E-Mail-Adresse und was du anlegst: Kalender, Stempel und Abdrücke.",
      privacy: "Mehr im Datenschutz",
      exportTitle: "Deine Daten",
      exportText:
        "Dein Konto, deine Kalender, Stempel, Abdrücke und Einladungen in einer Datei (JSON).",
      export: "Daten herunterladen",
      exportFailed:
        "Das Herunterladen hat nicht geklappt. Versuch es bitte noch einmal.",
      delete: "Konto löschen",
      deleteLead:
        "Das lässt sich nicht rückgängig machen. Für immer weg sind dann:",
      deleteGone: [
        "deine Kalender mit allen Abdrücken – auch für alle, mit denen du sie teilst",
        "deine Stempel und ihre Abdrücke, auch in den Kalendern anderer",
        "alles, was du in den Kalendern anderer gestempelt hast",
        "dein Konto selbst und die Einladungen, die du verschickt hast",
      ],
      deleteTip:
        "Magst du etwas behalten? Dann lad vorher deine Daten herunter.",
      password: "Zur Sicherheit: dein Passwort",
      deleteForGood: "Konto endgültig löschen",
      wrongPassword: "Das Passwort stimmt nicht.",
      tooMany: "Zu viele Versuche. Warte ein paar Minuten.",
    },
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
      remember: "Stay logged in",
      rememberOff:
        "Without the tick you're logged out once you close the browser – after a day at the latest.",
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
      until: (date: string) => `The invitation is valid until ${date}.`,
      accept: "Accept invitation",
      account: "Create a free account or log in – and you're in.",
      expiredTitle: "Invitation expired",
      expired: (from: string) =>
        `Invitations are valid for ${INVITE_DAYS} days – this one has expired, sorry. Just ask ${from ? `${from} ` : ""}for a new one.`,
      invalid: `This invitation doesn't exist anymore – it was used, taken back or expired after ${INVITE_DAYS} days. Just ask for a new one.`,
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
    offline: "Offline – we'll sync once you're back online",
    syncing: "Syncing …",
    pending: (n: number) =>
      n === 1 ? "1 change waiting" : `${n} changes waiting`,
    synced: "All synced",
    sync: {
      synced:
        "Everything's safe on the server – ready for your other devices too.",
      syncing: "Your changes are on their way.",
      pending: "They're safe on this device and go out in a moment.",
      offline: "Boop keeps going anyway – nothing gets lost.",
      offlineTitle: "Offline",
      how: "Boop keeps everything on your device first and sends it off once there's a connection: right after each change, when you're back online, when you open the app and every 30 seconds.",
      now: "Sync now",
    },
    offlineNoAccount:
      "You're offline. Log in once with a connection – after that Boop works offline too.",
    calendars: "Calendars",
    newCalendar: "New calendar",
    newCalendarName: "Calendar name",
    calendarPlaceholder: "e.g. family, workouts, trip …",
    create: "Create",
    deleteCalendar: "Delete calendar",
    deleteCalendarConfirm: (name: string) =>
      `Delete “${name}” with all its stamps? This can't be undone.`,
    noCalendar: "No calendar yet – make one to get going.",
    stamps: "Your stamps",
    noStamps: "No stamps yet – draw your first one!",
    newStamp: "New stamp",
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
      title: "New stamp",
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
      redo: "Redo",
      clear: "Clear",
      width: "Line width",
      widths: { thin: "Thin", medium: "Medium", thick: "Thick" },
      upload: "Upload SVG",
      inverted: "Inverted (cut out)",
      special: "Special – bigger & sparkly",
      rim: "Rim",
      rims: {
        plain: "Plain",
        dashed: "Dashed",
        dotted: "Dotted",
        wave: "Wave",
        zigzag: "Zigzag",
        scallop: "Scallops",
        double: "Double",
      },
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
      picked: "Print selected.",
      pickedKeys: "Delete or ⌫ removes it.",
      remove: "Remove print",
      undo: "Undo",
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
        `Invitation sent to ${email} – it's valid for ${INVITE_DAYS} days. They're in once they have an account.`,
      invitesTitle: "Invited",
      revoke: "Take back",
      notFound: "That didn't work.",
      members: "Members",
      owner: "Owner",
      remove: "Remove",
      leave: "Leave calendar",
      leaveAsk: (owner: string) =>
        `Really leave? You won't see it any more – you only get back in if ${owner} invites you again.`,
      leaveYes: "Yes, leave",
    },
    save: "Save",
    settings: {
      title: "Settings",
      shared: {
        title: "For everyone",
        owner:
          "The calendar itself – what you change here changes for everyone in it.",
        member: (name: string) => `The calendar itself – that's up to ${name}.`,
      },
      own: {
        title: "Just for you",
        text: "Everyone sets this for themselves.",
        colorOwner: "Your color. Whoever doesn't pick one sees it too.",
        colorMember:
          "Only for you, on this device – the others see their own color.",
        colorReset: "Same as the calendar",
      },
      deleteShared: (others: number) =>
        others === 1
          ? "It'll be gone for the other person in it, too."
          : `It'll be gone for the ${others} others in it, too.`,
      deleteNext: "Yes, get rid of it",
      deleteType: (name: string) =>
        `Really sure? Then type its name to confirm: ${name}`,
      deleteForGood: "Delete for good",
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
    accountSheet: {
      title: "Account",
      name: "Your name – how the others see you",
      nameFailed: "The name couldn't be saved. Please try again.",
      email: (email: string) => `Logged in as ${email}`,
      stored:
        "Boop keeps your name, your email address and what you make: calendars, stamps and prints.",
      privacy: "More in the privacy notes",
      exportTitle: "Your data",
      exportText:
        "Your account, calendars, stamps, prints and invitations in one file (JSON).",
      export: "Download data",
      exportFailed: "The download didn't work. Please try again.",
      delete: "Delete account",
      deleteLead: "This can't be undone. Gone for good are then:",
      deleteGone: [
        "your calendars with all their prints – for everyone you share them with, too",
        "your stamps and their prints, in other people's calendars too",
        "everything you stamped in other people's calendars",
        "your account itself and the invitations you sent",
      ],
      deleteTip: "Want to keep something? Then download your data first.",
      password: "To be safe: your password",
      deleteForGood: "Delete account for good",
      wrongPassword: "That's not the password.",
      tooMany: "Too many tries. Wait a few minutes.",
    },
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
