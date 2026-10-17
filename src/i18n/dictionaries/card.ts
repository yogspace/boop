import type { Shape } from "../flat";
import { template } from "../template";

/** A card's page – a stamp someone sent (features/cards/ui). */

const de = {
  card: {
    title: template(
      {
        named: "{name} schickt dir einen Stempel",
        unnamed: "Ein Stempel für dich",
      },
      (say) => (name: string) => (name ? say.named({ name }) : say.unnamed())
    ),
    description:
      "Übernimm ihn in deine Stempel und boop ihn auf deine Tage – mit Boop, dem Doodle-Stempelkalender.",
    take: "Stempel speichern",
    taken: "Schon gespeichert – er liegt bei deinen Stempeln",
    mine: "Deine Karte",
    mineText:
      "So sieht sie für alle aus, die den Link bekommen. Schick ihn weiter, wem du magst.",
    copy: "Link kopieren",
    copied: "Kopiert!",
    login: "Anmelden und speichern",
    signedOut:
      "Mit einem kostenlosen Boop-Konto speicherst du ihn bei deinen Stempeln und boopst ihn auf deine Tage.",
    goneTitle: "Diese Karte gibt es nicht (mehr)",
    goneText:
      "Vielleicht wurde der Stempel gelöscht – oder der Link ist nicht ganz vollständig. Frag einfach nach einer neuen Karte.",
    home: "Zu Boop",
    offline: "Du bist offline – die Karte kommt, sobald du wieder Netz hast.",
  },
};

const en: Shape<typeof de> = {
  card: {
    title: {
      named: "{name} is sending you a stamp",
      unnamed: "A stamp for you",
    },
    description:
      "Take it into your stamps and boop it onto your days – with Boop, the doodle stamp calendar.",
    take: "Save stamp",
    taken: "Saved already – it's with your stamps",
    mine: "Your card",
    mineText:
      "This is how everyone with the link sees it. Pass it on to whoever you like.",
    copy: "Copy link",
    copied: "Copied!",
    login: "Log in and save",
    signedOut:
      "With a free Boop account you save it with your stamps and boop it onto your days.",
    goneTitle: "This card doesn't exist (anymore)",
    goneText:
      "Maybe the stamp was deleted – or the link isn't quite complete. Just ask for a new card.",
    home: "To Boop",
    offline: "You're offline – the card comes as soon as you're back online.",
  },
};

export const cardTexts = { de, en };
