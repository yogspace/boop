import type { Shape } from "../flat";
import { template } from "../template";

/**
 * A stamp's sheet – shared, sent as a card, given to all by Boop – the
 * shelf's order, a gift still wrapped, and a card that arrives.
 */

const de = {
  stamp: {
    untitled: "Stempel",
    by: template("Von {name}", (say) => (name: string) => say({ name })),
    shared: "Geteilt",
    // The section of a stamp's sheet: the calendars it is shared with,
    // and the cards made of it.
    sharedWith: "Geteilt mit",
    shareText:
      "Er bleibt dein Stempel. Wer in einem angekreuzten Kalender ist, darf auch damit stempeln.",
    shareNone:
      "Teile zuerst einen Kalender – dann kannst du dort auch deine Stempel teilen.",
    onlyYou: "Bisher nur du",
    // Drawing it anew – a stamp one drew oneself.
    edit: "Bearbeiten",
    print3d: "Für den 3D-Drucker (STL)",
    hint: template(
      "{mm} mm breit, mit „boop“ auf dem Rücken. Er steht auf seiner Stempelfläche, der Knauf zeigt nach oben – nur größere Vertiefungen brauchen Stützen vom Druckbett. Die Fläche ist gespiegelt, so kommt dein Abdruck richtig herum raus.",
      (say) => (mm: number) => say({ mm })
    ),
    delete: "Stempel löschen",
    deleteConfirm: "Diesen Stempel löschen? Auch seine Abdrücke verschwinden.",
    // Where a stamp came from that one didn't draw (features/cards): a
    // card someone sent, a gift from Boop – a giver without a name: none.
    origin: template(
      { named: "von {name}", unnamed: "geschenkt" },
      (say) => (name: string) => (name ? say.named({ name }) : say.unnamed())
    ),
    // Sending one's own stamp as a card – a link to a page with it.
    card: {
      title: "Als Karte verschicken",
      text: "Wer den Link bekommt, sieht deinen Stempel – und kann ihn mit einem Boop-Konto in die eigenen Stempel übernehmen. Deiner bleibt, wie er ist.",
      message: "Ein paar Worte dazu (optional)",
      messagePlaceholder: "Hab dir was gezeichnet …",
      create: "Karte erstellen",
      share: "Karte teilen",
      another: "Noch eine Karte",
      offline: "Offline – Karten gibt es nur mit Verbindung.",
      // The cards made of a stamp, as their giver sees them – and taking
      // one back.
      sent: "Karten",
      view: "Ansehen",
      sentNone: "Noch keine Karte verschickt.",
      sentOffline:
        "Offline – welche Karten unterwegs sind, siehst du mit Verbindung.",
      takenBy: template(
        {
          some: "Übernommen von {names}",
          none: "Noch von niemandem übernommen",
        },
        (say) => (names: string) => (names ? say.some({ names }) : say.none())
      ),
      withdraw: "Zurückziehen",
      withdrawConfirm:
        "Diese Karte zurückziehen? Ihr Link führt dann ins Leere. Wer den Stempel schon übernommen hat, behält ihn.",
      tooMany:
        "Genug Karten für den Moment – versuch es in einer Stunde noch einmal.",
      // What the phone's share sheet sends along with the link.
      shareText: template(
        {
          named: "Ich schicke dir einen Stempel: „{name}“",
          unnamed: "Ich schicke dir einen Stempel",
        },
        (say) => (name: string) => (name ? say.named({ name }) : say.unnamed())
      ),
    },
    // A gift from Boop: a stamp of one's own sent to everyone – for an
    // account with the admin box alone (features/cards/gifts.ts).
    gift: {
      title: "Geschenk von Boop",
      text: "Schick diesen Stempel an alle: Jedes Boop-Konto bekommt eine eigene Kopie, „von Boop“ – deins auch.",
      message: "Ein paar Worte dazu (optional)",
      messagePlaceholder: "Frohes Stempeln!",
      send: "An alle verschicken",
      confirm:
        "Dieser Stempel geht an alle Boop-Konten, die ihn noch nicht haben – auch an neue seit dem letzten Mal. Zurückholen lässt er sich nicht.",
      yes: "Ja, an alle",
      sent: template(
        {
          none: "Alle haben ihn schon – seit dem letzten Mal ist niemand dazugekommen.",
          one: "Unterwegs an 1 Konto",
          many: "Unterwegs an {n} Konten",
        },
        (say) => (n: number) =>
          n === 0 ? say.none() : n === 1 ? say.one() : say.many({ n })
      ),
      offline: "Offline – verschicken geht nur mit Verbindung.",
      tooMany:
        "Genug Geschenke für den Moment – versuch es in einer Stunde noch einmal.",
      forbidden: "Dieses Konto darf keine Geschenke verschicken.",
    },
  },
  // The shelf's order, the day's tray's too – kept on the device
  // (features/app/shelf.ts).
  shelf: {
    order: "Ordnen",
    recent: "Zuletzt benutzt",
    newest: "Neueste zuerst",
    person: "Nach Person",
    color: "Nach Farbe",
    mine: "Meine",
    boop: "Boop",
    gifted: "Geschenkt",
  },
  // A gift from Boop as it comes: a parcel on the shelf, read out – a tap
  // unwraps it (features/stickers/unwrap.tsx).
  parcel: "Ein Geschenk von Boop – zum Auspacken antippen",
  // A card that came to the account: taken on its page, or after logging
  // in (features/app/arrivals.tsx).
  arrival: {
    cardTitle: "Angekommen!",
    cardText: template(
      {
        named: "Der Stempel von {name} ist jetzt in deinen Stempeln.",
        unnamed: "Der Stempel ist jetzt in deinen Stempeln.",
      },
      (say) => (name: string) => (name ? say.named({ name }) : say.unnamed())
    ),
    goneTitle: "Karte nicht mehr da",
    goneText:
      "Die Karte, die du vor dem Anmelden geöffnet hast, gibt es nicht mehr – ihr Stempel ließ sich nicht übernehmen.",
    toShelf: "Zu deinen Stempeln",
    close: "Schließen",
  },
};

const en: Shape<typeof de> = {
  stamp: {
    untitled: "Stamp",
    by: "By {name}",
    shared: "Shared",
    sharedWith: "Shared with",
    shareText:
      "It stays your stamp. Everyone in a calendar you tick may stamp with it too.",
    shareNone:
      "Share a calendar first – then you can share your stamps there, too.",
    onlyYou: "Just you so far",
    edit: "Edit",
    print3d: "For the 3D printer (STL)",
    hint: "{mm} mm wide, with “boop” on its back. It stands on its stamp face, knob up – only bigger hollows need supports from the bed. The face is mirrored, so your print comes out the right way round.",
    delete: "Delete stamp",
    deleteConfirm: "Delete this stamp? Its prints go too.",
    origin: { named: "from {name}", unnamed: "a gift" },
    card: {
      title: "Send as a card",
      text: "Whoever gets the link sees your stamp – and with a Boop account can take it into their own stamps. Yours stays as it is.",
      message: "A few words with it (optional)",
      messagePlaceholder: "Drew something for you …",
      create: "Make the card",
      share: "Share the card",
      another: "Another card",
      offline: "Offline – cards need a connection.",
      sent: "Cards",
      view: "View",
      sentNone: "No card sent yet.",
      sentOffline: "Offline – the cards on their way show with a connection.",
      takenBy: {
        some: "Taken by {names}",
        none: "Not taken by anyone yet",
      },
      withdraw: "Take back",
      withdrawConfirm:
        "Take this card back? Its link leads nowhere then. Whoever took the stamp already keeps it.",
      tooMany: "Enough cards for now – try again in an hour.",
      shareText: {
        named: "I'm sending you a stamp: “{name}”",
        unnamed: "I'm sending you a stamp",
      },
    },
    gift: {
      title: "A gift from Boop",
      text: "Send this stamp to everyone: every Boop account gets a copy of its own, “from Boop” – yours too.",
      message: "A few words with it (optional)",
      messagePlaceholder: "Happy stamping!",
      send: "Send to everyone",
      confirm:
        "This stamp goes to every Boop account that doesn't have it yet – new ones since last time too. It can't be taken back.",
      yes: "Yes, to everyone",
      sent: {
        none: "Everyone has it already – nobody new since last time.",
        one: "On its way to 1 account",
        many: "On its way to {n} accounts",
      },
      offline: "Offline – sending needs a connection.",
      tooMany: "Enough gifts for now – try again in an hour.",
      forbidden: "This account can't send gifts.",
    },
  },
  shelf: {
    order: "Order",
    recent: "Recently used",
    newest: "Newest first",
    person: "By person",
    color: "By color",
    mine: "Mine",
    boop: "Boop",
    gifted: "Gifts",
  },
  parcel: "A gift from Boop – tap to unwrap",
  arrival: {
    cardTitle: "It's here!",
    cardText: {
      named: "The stamp from {name} is in your stamps now.",
      unnamed: "The stamp is in your stamps now.",
    },
    goneTitle: "Card no longer there",
    goneText:
      "The card you opened before logging in is gone – its stamp couldn't be taken.",
    toShelf: "To your stamps",
    close: "Close",
  },
};

export const stampsTexts = { de, en };
