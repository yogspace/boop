"use client";

import { type FormEvent, useState } from "react";
import {
  Button,
  Card,
  FIELD_BOX,
  FIELD_INPUT,
  Field,
  Notice,
} from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

type Message = { tone: "error" | "success"; text: string };

/**
 * The contact form in the imprint (the “Contact form” block) – sent to
 * /next/contact, which mails it on; nothing is stored. The route answers
 * with a status only; the words for it are here (`contact`, editable in
 * the CMS).
 */
export const ContactForm = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale).contact;
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
        setNotice({
          tone: "error",
          text: problems[response.status] ?? t.failed,
        });
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
        <label className="flex flex-col gap-2">
          <span className="font-bold text-sm">{t.message}</span>
          <span className={FIELD_BOX}>
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
          </span>
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
