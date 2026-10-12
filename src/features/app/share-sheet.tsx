"use client";

import { type FormEvent, useState } from "react";
import type { Snapshot } from "valtio";
import { Button, Field, Notice } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import type { CalendarDoc } from "@/features/calendar/model";
import { sync, useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { Sheet } from "./sheet";

/**
 * Who is in a calendar – the owner invites by email and removes people; a
 * member can leave. Needs a connection: membership is decided by the server.
 */
export const ShareSheet = ({
  calendar,
  locale,
  onClose,
}: {
  calendar: Snapshot<CalendarDoc>;
  locale: Locale;
  onClose: () => void;
}) => {
  const t = dictionaryOf(locale);
  const { me, people, online } = useBoop();
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const owner = calendar.owner === me?.id;

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const response = await fetch(`/api/calendars/${calendar.id}/members`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      added?: boolean;
      person?: { name: string };
    } | null;
    setBusy(false);
    if (body?.added) {
      setNotice({
        tone: "success",
        text: t.app.share.added(body.person?.name ?? email),
      });
      setEmail("");
      trackEvent("calendar-shared");
      await sync();
    } else {
      setNotice({
        tone: "error",
        text: response?.ok ? t.app.share.notFound : t.auth.failed,
      });
    }
  };

  const remove = async (account: string) => {
    setBusy(true);
    await fetch(`/api/calendars/${calendar.id}/members/${account}`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => null);
    setBusy(false);
    await sync();
    if (account === me?.id) onClose();
  };

  return (
    <Sheet onClose={onClose} title={`${t.app.share.title}: ${calendar.name}`}>
      {!online && <Notice>{t.auth.offline}</Notice>}
      {owner && !calendar.personal && (
        <form className="flex flex-col gap-3" onSubmit={invite}>
          <p className="text-muted text-sm">{t.app.share.text}</p>
          <Field
            autoComplete="off"
            label={t.app.share.email}
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          <Button disabled={busy || !online} type="submit">
            {t.app.share.add}
          </Button>
        </form>
      )}
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <div>
        <h3 className="mb-2 font-bold">{t.app.share.members}</h3>
        <ul className="flex flex-col gap-2">
          {calendar.members.map((id) => (
            <li className="flex items-center justify-between gap-2" key={id}>
              <span>
                {people[id] ?? "…"}
                {id === calendar.owner && (
                  <span className="text-muted text-sm">
                    {" "}
                    · {t.app.share.owner}
                  </span>
                )}
              </span>
              {owner && id !== calendar.owner && (
                <Button
                  className="px-3 py-1 text-sm"
                  disabled={busy || !online}
                  onClick={() => remove(id)}
                  variant="plain"
                >
                  {t.app.share.remove}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
      {!owner && me && (
        <Button
          disabled={busy || !online}
          onClick={() => remove(me.id)}
          variant="plain"
        >
          {t.app.share.leave}
        </Button>
      )}
    </Sheet>
  );
};
