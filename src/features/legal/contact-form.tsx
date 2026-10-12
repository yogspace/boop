"use client";

import { type FormEvent, useState } from "react";
import { Button, Card, FIELD_INPUT, Field, Notice } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";

const de = {
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
  failed: "Das hat leider nicht geklappt. Versuch es bitte später noch einmal.",
};

const TEXTS: Record<Locale, typeof de> = {
  de,
  en: {
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

type Message = { tone: "error" | "success"; text: string };

/**
 * The contact form in the imprint (the “Contact form” block) – sent to
 * /next/contact, which mails it on; nothing is stored.
 */
export const ContactForm = ({ locale }: { locale: Locale }) => {
  const t = TEXTS[locale];
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Message | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!navigator.onLine) {
      setNotice({ tone: "error", text: t.offline });
      return;
    }
    const form = event.currentTarget;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/next/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      if (response.ok) {
        form.reset();
        setNotice({ tone: "success", text: t.sent });
      } else {
        const problems: Record<number, string> = {
          400: t.invalid,
          429: t.tooMany,
        };
        setNotice({ tone: "error", text: problems[response.status] ?? t.failed });
      }
    } catch {
      setNotice({ tone: "error", text: t.failed });
    } finally {
      setBusy(false);
    }
  };

  // A new message begins: the last notice goes.
  const typing = () => {
    if (notice) setNotice(null);
  };

  return (
    <Card className="mt-3 mb-4 p-5 sm:p-6">
      <p>{t.intro}</p>
      <form className="flex flex-col gap-4" onInput={typing} onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            autoComplete="name"
            label={t.name}
            maxLength={200}
            name="name"
            required
          />
          <Field
            autoComplete="email"
            label={t.email}
            maxLength={200}
            name="email"
            required
            type="email"
          />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="font-bold text-sm">{t.message}</span>
          <textarea
            className={cn(
              FIELD_INPUT,
              "field-sizing-content min-h-36 resize-none leading-relaxed"
            )}
            maxLength={5000}
            name="message"
            required
            rows={5}
          />
        </label>
        {/* Honeypot – out of sight and reach, but not display:none (bots skip
            that); bots fill it in. */}
        <input
          aria-hidden
          autoComplete="off"
          className="pointer-events-none absolute size-px overflow-hidden opacity-0"
          name="website"
          tabIndex={-1}
        />
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        <Button className="self-start" disabled={busy} type="submit">
          {busy ? t.sending : t.send}
        </Button>
      </form>
    </Card>
  );
};
