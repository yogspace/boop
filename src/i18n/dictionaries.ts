import { UNVERIFIED_DAYS, WARNING_DAYS } from "../features/accounts/retention";
import { INVITE_DAYS } from "../features/calendar/invite-expiry";
import { LOCALES, type Locale } from "./config";
import { build, type Flat, flatten, type Resolved, type Shape } from "./flat";
import { checkPlaceholders, type Placeholders, template } from "./template";

/**
 * Every text of the site and the app, per language – as the code writes
 * them. German is the shape; English must have the same keys (checked by
 * the type below). Not here: the stamp colors' names – they come with the
 * colors, from the CMS (features/calendar/palette.ts).
 *
 * What the pages show comes from the CMS: the “Translations” global
 * (features/translations) has a field per key here and wins where it is
 * filled; a new key, an emptied field or no database show the text below.
 *
 * HOW TO READ A TEXT
 *
 * - In a client component: `dictionaryOf(locale)`. The layout hands the
 *   CMS's texts to `TextsProvider`, which puts them in use while rendering,
 *   on the server and in the browser (features/translations/
 *   texts-provider.tsx) – they are part of the page, so it also opens
 *   offline.
 * - On the server – a server component, a layout, `generateMetadata`, a
 *   route, a mail, a notification: `await getDictionary(locale)`
 *   (features/translations/get-texts.ts). No provider renders there first –
 *   `dictionaryOf` alone could still give the code's.
 * - A component drawn on both sides (components/site-footer.tsx) calls
 *   `dictionaryOf` – on the server under a component that awaited
 *   `getDictionary` for that language, which puts them in use there too.
 *
 * HOW TO WRITE ONE
 *
 * - A plain text is a string. A list is an array; the CMS has one field per
 *   entry, as many as here.
 * - A text with something in it – a name, a number, one wording for one and
 *   another for many – is a `template` (template.ts): written with
 *   placeholders, “Hallo {name}!”, so it can be edited in the CMS. In
 *   English it is only the wording(s).
 * - A function written by hand still works, but stays out of the CMS.
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
      text: template(
        "{from} möchte den Kalender „{calendar}“ mit dir teilen.",
        (say) => (from: string, calendar: string) => say({ from, calendar })
      ),
      until: template(
        "Die Einladung gilt bis zum {date} Uhr.",
        (say) => (date: string) => say({ date })
      ),
      accept: "Einladung annehmen",
      account:
        "Erstell ein kostenloses Konto oder melde dich an – dann bist du dabei.",
      expiredTitle: "Einladung abgelaufen",
      expired: template(
        {
          named:
            "Einladungen gelten {days} Tage – diese ist leider abgelaufen. Frag {from} einfach nach einer neuen.",
          unnamed:
            "Einladungen gelten {days} Tage – diese ist leider abgelaufen. Frag einfach nach einer neuen.",
        },
        (say) => (from: string) =>
          from
            ? say.named({ from, days: INVITE_DAYS })
            : say.unnamed({ days: INVITE_DAYS }),
        { optional: ["days"] }
      ),
      invalid: template(
        "Diese Einladung gibt es nicht mehr – sie wurde schon benutzt, zurückgezogen oder ist nach {days} Tagen abgelaufen. Frag einfach nach einer neuen.",
        (say) => say({ days: INVITE_DAYS }),
        { optional: ["days"] }
      ),
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
    hello: template(
      { named: "Hallo {name}!", unnamed: "Hallo!" },
      (say) => (name: string) => (name ? say.named({ name }) : say.unnamed())
    ),
    lead: "Welcher Tag bekommt heute einen Boop?",
    offline: "Offline – wir gleichen ab, sobald du wieder Netz hast",
    syncing: "Gleiche ab …",
    pending: template(
      { one: "1 Änderung wartet", many: "{n} Änderungen warten" },
      (say) => (n: number) => (n === 1 ? say.one() : say.many({ n }))
    ),
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
    deleteCalendarConfirm: template(
      "„{name}“ mit allen Stempeln darauf löschen? Das lässt sich nicht rückgängig machen.",
      (say) => (name: string) => say({ name })
    ),
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
    view: {
      label: "Ansicht",
      today: "Heute",
      month: "Monat",
      year: "Jahr",
      prevYear: "Vorheriges Jahr",
      nextYear: "Nächstes Jahr",
      thisMonth: "Dieser Monat",
      thisYear: "Dieses Jahr",
    },
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
      empty: "Noch nichts los – wähl einen Stempel und tipp auf den Tag.",
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
    note: {
      label: "Notiz zum Tag",
      today: "Was war heute?",
      past: "Was war an dem Tag?",
      future: "Was steht an?",
      bold: "Fett",
      underline: "Unterstrichen",
      ctrl: "Strg",
      by: template(
        { named: "{name}, {when}", unnamed: "{when}" },
        (say) => (name: string, when: string) =>
          name ? say.named({ name, when }) : say.unnamed({ when })
      ),
      justNow: "gerade eben",
      inMonth: "Notiz",
    },
    share: {
      title: "Teilen",
      text: "Lade Leute per E-Mail ein. Ohne Boop-Konto bekommen sie eine Einladung.",
      email: "E-Mail-Adresse",
      add: "Einladen",
      added: template(
        "{name} ist jetzt dabei.",
        (say) => (name: string) => say({ name })
      ),
      invited: template(
        "Einladung an {email} verschickt – sie gilt {days} Tage. Sobald es ein Konto gibt, ist die Person dabei.",
        (say) => (email: string) => say({ email, days: INVITE_DAYS }),
        { optional: ["days"] }
      ),
      invitesTitle: "Eingeladen",
      revoke: "Zurückziehen",
      notFound: "Das hat nicht geklappt.",
      members: "Dabei",
      owner: "Besitzer:in",
      remove: "Entfernen",
      leave: "Kalender verlassen",
      leaveAsk: template(
        "Wirklich verlassen? Du siehst ihn dann nicht mehr – zurück kommst du nur, wenn {owner} dich wieder einlädt.",
        (say) => (owner: string) => say({ owner })
      ),
      leaveYes: "Ja, verlassen",
    },
    save: "Speichern",
    settings: {
      title: "Einstellungen",
      shared: {
        title: "Für alle",
        owner:
          "Der Kalender selbst – was du hier änderst, ändert sich für alle darin.",
        member: template(
          "Der Kalender selbst – das legt {name} fest.",
          (say) => (name: string) => say({ name })
        ),
      },
      own: {
        title: "Nur für dich",
        text: "Das stellt jede:r für sich ein.",
        colorMember:
          "Nur bei dir, auf diesem Gerät – die anderen sehen ihre eigene Farbe.",
        colorReset: "Wie der Kalender",
      },
      deleteShared: template(
        {
          one: "Er ist dann auch für die andere Person weg.",
          many: "Er ist dann auch für die {others} anderen weg.",
        },
        (say) => (others: number) =>
          others === 1 ? say.one() : say.many({ others })
      ),
      deleteNext: "Ja, weg damit",
      deleteType: template(
        "Ganz sicher? Dann tipp zur Bestätigung seinen Namen ein: {name}",
        (say) => (name: string) => say({ name })
      ),
      deleteForGood: "Endgültig löschen",
    },
    push: {
      title: "Benachrichtigungen",
      on: "Auf diesem Gerät an. Was du hier einstellst, gilt für alle deine Geräte.",
      enable: "Benachrichtigungen einschalten",
      disable: "Auf diesem Gerät ausschalten",
      unsupported: "Dieser Browser kann leider keine Benachrichtigungen.",
      install:
        "Auf dem iPhone erst zum Home-Bildschirm hinzufügen: Teilen → „Zum Home-Bildschirm“. Dann Boop von dort öffnen.",
      denied:
        "Benachrichtigungen sind für Boop blockiert. Erlaub sie in den Einstellungen deines Browsers – auf dem iPhone unter Einstellungen → Mitteilungen → Boop.",
      failed: "Das hat nicht geklappt. Versuch es bitte noch einmal.",
      offline: "Zum Ändern brauchst du eine Verbindung.",
      reminder: "Erinnern, wenn ich heute noch nichts eingetragen habe",
      stamped: "Wenn jemand anderes hier stempelt",
      changed: "Wenn jemand anderes etwas ändert",
      changedHint:
        "Notizen, verschobene oder entfernte Abdrücke, ein neuer Name, wer dazukommt oder geht.",
      time: "Erinnerung um",
      timeHint: "Für alle deine Kalender – in der Uhrzeit deines Geräts.",
      // What the notifications say – in the device's language.
      someone: "Jemand",
      stampedTitle: "Boop!",
      stampedBody: template(
        "{name} hat in „{calendar}“ gestempelt.",
        (say) => (name: string, calendar: string) => say({ name, calendar })
      ),
      changedTitle: "Boop!",
      // One kind of change by its name; several: `several`. {name} is who
      // did it – who came or went, for those three.
      changedBody: template(
        {
          note: "{name} hat in „{calendar}“ eine Notiz geschrieben.",
          noteDeleted: "{name} hat in „{calendar}“ eine Notiz gelöscht.",
          moved: "{name} hat in „{calendar}“ Abdrücke verschoben.",
          unstamped: "{name} hat in „{calendar}“ Abdrücke entfernt.",
          renamed: "{name} hat „{from}“ in „{to}“ umbenannt.",
          joined: "{name} ist jetzt in „{calendar}“ dabei.",
          left: "{name} hat „{calendar}“ verlassen.",
          removed: "{name} ist nicht mehr in „{calendar}“ dabei.",
          several: "{name} hat in „{calendar}“ einiges geändert.",
        },
        (say) =>
          (
            kind:
              | "note"
              | "noteDeleted"
              | "moved"
              | "unstamped"
              | "renamed"
              | "joined"
              | "left"
              | "removed"
              | "several",
            {
              name,
              calendar,
              from = "",
            }: { name: string; calendar: string; from?: string }
          ) =>
            kind === "renamed"
              ? say.renamed({ name, from, to: calendar })
              : say[kind]({ name, calendar })
      ),
      reminderTitle: "Heute schon gestempelt?",
      // Each calendar quoted; several: “„A“, „B“ und „C“ …”.
      reminderBody: template(
        {
          quote: "„{name}“",
          one: "{calendar} wartet noch auf deinen Stempel.",
          many: "{calendars} und {last} warten noch auf deinen Stempel.",
        },
        (say) => (calendars: string[]) => {
          const names = calendars.map((name) => say.quote({ name }));
          const last = names.pop() ?? "";
          return names.length
            ? say.many({ calendars: names.join(", "), last })
            : say.one({ calendar: last });
        }
      ),
    },
    ical: {
      title: "Kalender-Abo",
      text: "Hol diesen Kalender in deine Kalender-App (Apple, Google & Co.): Jeder Tag mit Stempeln oder einer Notiz wird dort ein ganztägiger Termin.",
      create: "Abo-Adresse erzeugen",
      address: "Deine Abo-Adresse",
      warning:
        "Wer diese Adresse kennt, kann mitlesen – ganz ohne Anmeldung. Behalt sie also für dich.",
      copy: "Kopieren",
      copied: "Kopiert!",
      open: "In Kalender-App öffnen",
      renew: "Neue Adresse",
      renewAsk:
        "Neue Adresse erzeugen? Die alte gilt dann nicht mehr – deine Kalender-App braucht die neue.",
      renewYes: "Ja, neue Adresse",
      revoke: "Zurückziehen",
      fetched: "Zuletzt abgerufen:",
      neverFetched: "Noch nicht abgerufen.",
      download: "Als Datei herunterladen (.ics)",
      offline: "Dafür brauchst du eine Verbindung.",
      failed: "Das hat nicht geklappt. Versuch es bitte noch einmal.",
      // What the feed says – in the account's language.
      stamp: "Stempel",
      stamps: "Stempel",
      calendar: "Kalender",
    },
    stamp: {
      untitled: "Stempel",
      by: template("Von {name}", (say) => (name: string) => say({ name })),
      shared: "Geteilt",
      share: "Teilen",
      shareText:
        "Er bleibt dein Stempel. Wer in einem angekreuzten Kalender ist, darf auch damit stempeln.",
      shareNone:
        "Teile zuerst einen Kalender – dann kannst du dort auch deine Stempel teilen.",
      onlyYou: "Bisher nur du",
      print3d: "Für den 3D-Drucker (STL)",
      hint: template(
        "{mm} mm breit, mit „boop“ auf dem Rücken. Er steht auf seiner Stempelfläche, der Knauf zeigt nach oben – nur größere Vertiefungen brauchen Stützen vom Druckbett. Die Fläche ist gespiegelt, so kommt dein Abdruck richtig herum raus.",
        (say) => (mm: number) => say({ mm })
      ),
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
      email: template(
        "Angemeldet als {email}",
        (say) => (email: string) => say({ email })
      ),
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
      deleteTip:
        "Magst du etwas behalten? Dann lad vorher deine Daten herunter.",
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
  },
  // The contact form in the imprint (features/legal/contact-form.tsx).
  contact: {
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
  // The mails – in the account's language (features/accounts/emails.ts),
  // the invitation in the sender's (features/calendar/invites.ts).
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
      // The hours come with the mail: the collection sets them (emails.ts).
      body: template(
        "Jemand – hoffentlich du – möchte das Passwort für dein Boop-Konto ändern. Der Link gilt {hours} Stunde.",
        (say) => (hours: number) => say({ hours }),
        { optional: ["hours"] }
      ),
      button: "Neues Passwort wählen",
      footnote:
        "Das warst du nicht? Dann bleibt alles, wie es ist – dein Passwort ändert sich nur über den Link.",
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
        "Du kennst die Person nicht? Dann ignoriere diese Mail einfach – ohne Konto passiert nichts.",
    },
  },
};

/** The texts as the pages read them – a template is what it makes. */
export type Dictionary = Resolved<typeof de>;

/** Same keys as German, its own texts – of a template only the wording(s). */
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
      text: "{from} would like to share the calendar “{calendar}” with you.",
      until: "The invitation is valid until {date}.",
      accept: "Accept invitation",
      account: "Create a free account or log in – and you're in.",
      expiredTitle: "Invitation expired",
      expired: {
        named:
          "Invitations are valid for {days} days – this one has expired, sorry. Just ask {from} for a new one.",
        unnamed:
          "Invitations are valid for {days} days – this one has expired, sorry. Just ask for a new one.",
      },
      invalid:
        "This invitation doesn't exist anymore – it was used, taken back or expired after {days} days. Just ask for a new one.",
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
    hello: { named: "Hi {name}!", unnamed: "Hi!" },
    lead: "Which day gets a boop today?",
    offline: "Offline – we'll sync once you're back online",
    syncing: "Syncing …",
    pending: { one: "1 change waiting", many: "{n} changes waiting" },
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
    deleteCalendarConfirm:
      "Delete “{name}” with all its stamps? This can't be undone.",
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
    view: {
      label: "View",
      today: "Today",
      month: "Month",
      year: "Year",
      prevYear: "Previous year",
      nextYear: "Next year",
      thisMonth: "This month",
      thisYear: "This year",
    },
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
      empty: "Nothing here yet – pick a stamp and tap the day.",
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
    note: {
      label: "Note for the day",
      today: "What happened today?",
      past: "What happened that day?",
      future: "What's coming up?",
      bold: "Bold",
      underline: "Underline",
      ctrl: "Ctrl",
      by: { named: "{name}, {when}", unnamed: "{when}" },
      justNow: "just now",
      inMonth: "Note",
    },
    share: {
      title: "Share",
      text: "Invite people by email. Without a Boop account they get an invitation.",
      email: "Email address",
      add: "Invite",
      added: "{name} is in now.",
      invited:
        "Invitation sent to {email} – it's valid for {days} days. They're in once they have an account.",
      invitesTitle: "Invited",
      revoke: "Take back",
      notFound: "That didn't work.",
      members: "Members",
      owner: "Owner",
      remove: "Remove",
      leave: "Leave calendar",
      leaveAsk:
        "Really leave? You won't see it any more – you only get back in if {owner} invites you again.",
      leaveYes: "Yes, leave",
    },
    save: "Save",
    settings: {
      title: "Settings",
      shared: {
        title: "For everyone",
        owner:
          "The calendar itself – what you change here changes for everyone in it.",
        member: "The calendar itself – that's up to {name}.",
      },
      own: {
        title: "Just for you",
        text: "Everyone sets this for themselves.",
        colorMember:
          "Only for you, on this device – the others see their own color.",
        colorReset: "Same as the calendar",
      },
      deleteShared: {
        one: "It'll be gone for the other person in it, too.",
        many: "It'll be gone for the {others} others in it, too.",
      },
      deleteNext: "Yes, get rid of it",
      deleteType: "Really sure? Then type its name to confirm: {name}",
      deleteForGood: "Delete for good",
    },
    push: {
      title: "Notifications",
      on: "On for this device. What you set here counts on all your devices.",
      enable: "Turn on notifications",
      disable: "Turn off on this device",
      unsupported: "Sorry, this browser can't do notifications.",
      install:
        "On the iPhone, add Boop to your Home Screen first: Share → “Add to Home Screen”. Then open it from there.",
      denied:
        "Notifications are blocked for Boop. Allow them in your browser's settings – on the iPhone under Settings → Notifications → Boop.",
      failed: "That didn't work. Please try again.",
      offline: "Changing this needs a connection.",
      reminder: "Remind me when I haven't entered anything today",
      stamped: "When someone else stamps here",
      changed: "When someone else changes something",
      changedHint:
        "Notes, moved or removed prints, a new name, who joins or leaves.",
      time: "Reminder at",
      timeHint: "For all your calendars – on your device's clock.",
      someone: "Someone",
      stampedTitle: "Boop!",
      stampedBody: "{name} stamped in “{calendar}”.",
      changedTitle: "Boop!",
      changedBody: {
        note: "{name} wrote a note in “{calendar}”.",
        noteDeleted: "{name} deleted a note in “{calendar}”.",
        moved: "{name} moved prints in “{calendar}”.",
        unstamped: "{name} removed prints from “{calendar}”.",
        renamed: "{name} renamed “{from}” to “{to}”.",
        joined: "{name} is in “{calendar}” now.",
        left: "{name} left “{calendar}”.",
        removed: "{name} is no longer in “{calendar}”.",
        several: "{name} changed a few things in “{calendar}”.",
      },
      reminderTitle: "Stamped yet today?",
      reminderBody: {
        quote: "“{name}”",
        one: "{calendar} is still waiting for your stamp.",
        many: "{calendars} and {last} are still waiting for your stamp.",
      },
    },
    ical: {
      title: "Calendar subscription",
      text: "Get this calendar into your calendar app (Apple, Google & co.): every day with stamps or a note becomes an all-day event there.",
      create: "Create subscription address",
      address: "Your subscription address",
      warning:
        "Anyone who knows this address can read along – no login needed. So keep it to yourself.",
      copy: "Copy",
      copied: "Copied!",
      open: "Open in calendar app",
      renew: "New address",
      renewAsk:
        "Make a new address? The old one stops working – your calendar app needs the new one.",
      renewYes: "Yes, new address",
      revoke: "Take back",
      fetched: "Last fetched:",
      neverFetched: "Not fetched yet.",
      download: "Download as a file (.ics)",
      offline: "This needs a connection.",
      failed: "That didn't work. Please try again.",
      stamp: "Stamp",
      stamps: "stamps",
      calendar: "Calendar",
    },
    stamp: {
      untitled: "Stamp",
      by: "By {name}",
      shared: "Shared",
      share: "Share",
      shareText:
        "It stays your stamp. Everyone in a calendar you tick may stamp with it too.",
      shareNone:
        "Share a calendar first – then you can share your stamps there, too.",
      onlyYou: "Just you so far",
      print3d: "For the 3D printer (STL)",
      hint: "{mm} mm wide, with “boop” on its back. It stands on its stamp face, knob up – only bigger hollows need supports from the bed. The face is mirrored, so your print comes out the right way round.",
      delete: "Delete stamp",
      deleteConfirm: "Delete this stamp? Its prints go too.",
    },
    account: "Account",
    accountSheet: {
      title: "Account",
      name: "Your name – how the others see you",
      nameFailed: "The name couldn't be saved. Please try again.",
      email: "Logged in as {email}",
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
  },
  contact: {
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
        "Don't know them? Then simply ignore this mail – nothing happens without an account.",
    },
  },
};

// ── The texts in use ────────────────────────────────────────────────────────

const flat = { de: flatten(de), en: flatten(en) } satisfies Record<
  Locale,
  Flat
>;

/** The code's own texts by key (flat.ts), per language. */
export const CODE_TEXTS: Record<Locale, Record<string, string>> = {
  de: flat.de.texts,
  en: flat.en.texts,
};

/** The placeholders of the texts that have some – German's: the code fills them. */
export const PLACEHOLDERS: Record<string, Placeholders> = flat.de.placeholders;

/**
 * Functions written by hand – they have no text to store, so they stay as
 * the code has them, outside the CMS, until they are templates.
 */
export const CODE_ONLY: string[] = [
  ...new Set([...flat.de.codeOnly, ...flat.en.codeOnly]),
];

/** Texts from the CMS, per language and key. */
export type Texts = Partial<Record<Locale, Record<string, string>>>;

const NO_PLACEHOLDERS: Placeholders = { known: [], required: [] };

/**
 * Whether a text from the CMS may stand in for the code's: a key the code
 * has, something in it, and the placeholders the code fills – no other, and
 * none missing (template.ts). Checked when saving in the admin, and again
 * here: a text that doesn't fit shows the code's instead.
 */
export const fits = (key: string, text: unknown): text is string =>
  typeof text === "string" &&
  Boolean(text.trim()) &&
  Object.hasOwn(CODE_TEXTS.de, key) &&
  checkPlaceholders(text, PLACEHOLDERS[key] ?? NO_PLACEHOLDERS) === true;

/**
 * Of the CMS's texts, those to show: the ones that fit and say something
 * else than the code – all a page has to carry, as the code's are in it
 * anyway.
 */
export const usableTexts = (texts: unknown): Texts => {
  const given = (texts ?? {}) as Partial<Record<Locale, unknown>>;
  const usable: Texts = {};
  for (const locale of LOCALES) {
    const own = given[locale];
    if (!own || typeof own !== "object") continue;
    const kept = Object.entries(own).filter(
      ([key, text]) => fits(key, text) && text !== CODE_TEXTS[locale][key]
    );
    if (kept.length) usable[locale] = Object.fromEntries(kept);
  }
  return usable;
};

/**
 * The CMS's texts in use – one set for everybody, like the stamp colors
 * (features/calendar/palette.ts). Set while rendering: in the browser and
 * for client components on the server by `TextsProvider`, for server
 * components by `getDictionary` (features/translations).
 */
let inUse: Texts = {};
let given = "{}";
const built = new Map<Locale, Dictionary>();

/**
 * Puts the CMS's texts in use. The same again changes nothing – not even
 * the dictionaries handed out, so rendering twice is fine.
 */
export const setTexts = (texts: unknown) => {
  const next = JSON.stringify(texts ?? {});
  if (next === given) return;
  given = next;
  inUse = usableTexts(texts);
  built.clear();
};

const own: Record<Locale, unknown> = { de, en };

/**
 * A language's texts, as the pages read them: the CMS's where it has one
 * that fits, the code's for the rest. Synchronous – the texts in use, see
 * the top of this file for when that is the CMS's. One object per language
 * until the texts change.
 */
export const dictionaryOf = (locale: Locale): Dictionary => {
  const known = built.get(locale);
  if (known) return known;
  const cms = inUse[locale] ?? {};
  const code = CODE_TEXTS[locale];
  const dictionary = build(
    de,
    own[locale],
    (key) => cms[key] ?? code[key] ?? CODE_TEXTS.de[key] ?? ""
  );
  built.set(locale, dictionary);
  return dictionary;
};
