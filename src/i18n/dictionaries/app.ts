import type { Shape } from "../flat";
import { template } from "../template";
import { accountTexts } from "./app-account";
import { drawTexts } from "./app-draw";
import { settingsTexts } from "./app-settings";
import { sharingTexts } from "./app-sharing";
import { stampsTexts } from "./app-stamps";

/**
 * The app's texts: the greeting, the sync, the calendars and their views,
 * a day and its note – and, from the files beside this one, the stamp
 * editor, sharing, a calendar's settings, the stamps and the account.
 */

const de = {
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
    // The calendar every account starts with – named in the account's
    // language as it is made (calendar/membership.ts).
    firstCalendar: "Mein Kalender",
    stamps: "Deine Stempel",
    noStamps: "Noch keine Stempel – mal deinen ersten!",
    newStamp: "Neuer Stempel",
    // From a day's tray to the shelf, the page with all of them.
    allStamps: "Alle Stempel",
    // The way to the shelf beside the greeting – a little pile of stamps,
    // read out with how many there are (features/app/stamp-shelf.tsx).
    pile: template(
      {
        none: "Deine Stempel – noch keine",
        one: "Deine Stempel – 1 Stempel",
        many: "Deine Stempel – {n} Stempel",
      },
      (say) => (n: number) =>
        n === 0 ? say.none() : n === 1 ? say.one() : say.many({ n })
    ),
    // Back from the shelf to the calendars.
    backToCalendars: "Kalender",
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
    ...drawTexts.de,
    day: {
      empty: "Noch nichts los – wähl einen Stempel und tipp auf den Tag.",
      tray: "Stempel antippen, dann auf den Tag tippen",
      // The stamp in hand, by its name – one without: “Stempel”.
      holding: template(
        {
          named:
            "{name} in der Hand – tipp auf den Tag oder ein Stempelkissen.",
          unnamed:
            "Stempel in der Hand – tipp auf den Tag oder ein Stempelkissen.",
        },
        (say) => (name: string) => (name ? say.named({ name }) : say.unnamed())
      ),
      wheel: "Das Mausrad dreht ihn.",
      turnLeft: "Nach links drehen",
      turnRight: "Nach rechts drehen",
      // The angle between the two buttons – pressed, it is 0° again.
      straighten: "Drehung zurücksetzen",
      inHand: "In der Hand",
      picked: "Abdruck markiert.",
      pickedKeys: "Entf oder ⌫ entfernt ihn.",
      remove: "Abdruck entfernen",
      undo: "Rückgängig",
      redo: "Wiederholen",
      print: "Abdruck",
      ink: "Stempelkissen",
      // On a phone, the page and the day's note side by side – to switch.
      sides: "Blatt oder Notiz",
      page: "Blatt",
      note: "Notiz",
      noted: "Notiz – es steht etwas drin",
    },
    note: {
      label: "Notiz zum Tag",
      today: "Was war heute?",
      past: "Was war an dem Tag?",
      future: "Was steht an?",
      bold: "Fett",
      italic: "Kursiv",
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
    ...sharingTexts.de,
    save: "Speichern",
    ...settingsTexts.de,
    ...stampsTexts.de,
    ...accountTexts.de,
  },
};

const en: Shape<typeof de> = {
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
    firstCalendar: "My calendar",
    stamps: "Your stamps",
    noStamps: "No stamps yet – draw your first one!",
    newStamp: "New stamp",
    allStamps: "All stamps",
    pile: {
      none: "Your stamps – none yet",
      one: "Your stamps – 1 stamp",
      many: "Your stamps – {n} stamps",
    },
    backToCalendars: "Calendars",
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
    ...drawTexts.en,
    day: {
      empty: "Nothing here yet – pick a stamp and tap the day.",
      tray: "Tap a stamp, then tap the day",
      holding: {
        named: "{name} in your hand – tap the day or an ink pad.",
        unnamed: "Stamp in your hand – tap the day or an ink pad.",
      },
      wheel: "Scroll to turn it.",
      turnLeft: "Turn left",
      turnRight: "Turn right",
      straighten: "Reset rotation",
      inHand: "In your hand",
      picked: "Print selected.",
      pickedKeys: "Delete or ⌫ removes it.",
      remove: "Remove print",
      undo: "Undo",
      redo: "Redo",
      print: "Print",
      ink: "Ink pad",
      sides: "Page or note",
      page: "Page",
      note: "Note",
      noted: "Note – something's written",
    },
    note: {
      label: "Note for the day",
      today: "What happened today?",
      past: "What happened that day?",
      future: "What's coming up?",
      bold: "Bold",
      italic: "Italic",
      underline: "Underline",
      ctrl: "Ctrl",
      by: { named: "{name}, {when}", unnamed: "{when}" },
      justNow: "just now",
      inMonth: "Note",
    },
    ...sharingTexts.en,
    save: "Save",
    ...settingsTexts.en,
    ...stampsTexts.en,
    ...accountTexts.en,
  },
};

export const appTexts = { de, en };
