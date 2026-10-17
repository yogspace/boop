import type { Shape } from "../flat";

/** The contact form in the imprint (features/legal/contact-form.tsx). */

const de = {
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
};

const en: Shape<typeof de> = {
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
};

export const contactTexts = { de, en };
