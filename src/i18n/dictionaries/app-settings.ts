import type { Shape } from "../flat";
import { template } from "../template";

/**
 * A calendar's settings: the calendar's own and one's own, its
 * notifications – and what they say – and its subscription address.
 */

const de = {
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
        "Nur bei dir, auf all deinen Geräten – die anderen sehen ihre eigene Farbe.",
      colorReset: "Wie der Kalender",
      start: "Startansicht",
      startText:
        "So öffnet sich der Kalender bei dir, auf all deinen Geräten – umschalten kannst du jederzeit.",
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
    alone: "Meldet sich, sobald jemand mit in diesem Kalender ist.",
    time: "Erinnerung um",
    timeHint: "Für alle deine Kalender – in der Uhrzeit deines Geräts.",
    // The account's own two switches, in its sheet – and a word there when
    // this device hears nothing.
    invited: "Wenn mich jemand zu einem Kalender einlädt",
    gifts: "Wenn Boop mir einen Stempel schenkt",
    deviceOff:
      "Auf diesem Gerät sind Benachrichtigungen aus. Einschalten kannst du sie in den Einstellungen eines Kalenders.",
    // What the notifications say – in the device's language.
    someone: "Jemand",
    stampedTitle: "Boop!",
    stampedBody: template(
      "{name} hat in „{calendar}“ gestempelt.",
      (say) => (name: string, calendar: string) => say({ name, calendar })
    ),
    invitedTitle: "Boop!",
    invitedBody: template(
      "{name} lädt dich zu „{calendar}“ ein.",
      (say) => (name: string, calendar: string) => say({ name, calendar })
    ),
    giftTitle: "Boop!",
    giftBody: template(
      "Boop hat dir einen Stempel geschenkt: „{name}“",
      (say) => (name: string) => say({ name })
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
};

const en: Shape<typeof de> = {
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
        "Only for you, on all your devices – the others see their own color.",
      colorReset: "Same as the calendar",
      start: "Opens in",
      startText:
        "How the calendar opens for you, on all your devices – you can switch any time.",
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
    alone: "Speaks up once someone else is in this calendar.",
    time: "Reminder at",
    timeHint: "For all your calendars – on your device's clock.",
    invited: "When someone invites me to a calendar",
    gifts: "When Boop gives me a stamp",
    deviceOff:
      "Notifications are off on this device. You can turn them on in a calendar's settings.",
    someone: "Someone",
    stampedTitle: "Boop!",
    stampedBody: "{name} stamped in “{calendar}”.",
    invitedTitle: "Boop!",
    invitedBody: "{name} invited you to “{calendar}”.",
    giftTitle: "Boop!",
    giftBody: "Boop gave you a stamp: “{name}”",
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
};

export const settingsTexts = { de, en };
