"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { Snapshot } from "valtio";
import { Mail } from "@/components/doodles";
import { Button, Field, Notice } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import type { CalendarDoc } from "@/features/calendar/model";
import { sync, useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { Sheet } from "./sheet";

/**
 * Who is in a calendar – the owner invites by email (an account joins at
 * once, an address without one gets an invitation by mail) and removes
 * people; a member can leave. Needs a connection: the server decides.
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
  const [invites, setInvites] = useState<{ id: string; email: string }[]>([]);
  const owner = calendar.owner === me?.id;
  const base = `/api/calendars/${calendar.id}`;

  const loadInvites = useCallback(async () => {
    if (!(owner && online)) return;
    const response = await fetch(`${base}/invites`, {
      credentials: "include",
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      invites?: { id: string; email: string }[];
    } | null;
    setInvites(body?.invites ?? []);
  }, [base, owner, online]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const response = await fetch(`${base}/members`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      added?: boolean;
      invited?: boolean;
      person?: { name: string };
    } | null;
    setBusy(false);
    if (body?.added || body?.invited) {
      setNotice({
        tone: "success",
        text: body.added
          ? t.app.share.added(body.person?.name ?? email)
          : t.app.share.invited(email),
      });
      setEmail("");
      trackEvent("calendar-shared");
      await Promise.all([sync(), loadInvites()]);
    } else {
      setNotice({ tone: "error", text: t.app.share.notFound });
    }
  };

  const remove = async (account: string) => {
    setBusy(true);
    await fetch(`${base}/members/${account}`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => null);
    setBusy(false);
    await sync();
    if (account === me?.id) onClose();
  };

  const revoke = async (id: string) => {
    setBusy(true);
    await fetch(`${base}/invites/${id}`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => null);
    setBusy(false);
    await loadInvites();
  };

  return (
    <Sheet onClose={onClose} title={`${t.app.share.title}: ${calendar.name}`}>
      {!online && <Notice>{t.auth.offline}</Notice>}
      {owner && (
        <form className="flex flex-col gap-3" onSubmit={invite}>
          <p className="font-medium text-muted text-sm">{t.app.share.text}</p>
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
        <h3 className="mb-2 font-black text-lg">{t.app.share.members}</h3>
        <ul className="flex flex-col gap-2">
          {calendar.members.map((id) => (
            <li
              className="scribble scribble-bare scribble-soft flex items-center justify-between gap-2 rounded-2xl px-3 py-2"
              key={id}
            >
              <span className="flex items-center gap-2 font-bold">
                <span className="scribble scribble-sm scribble-thin flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-black text-sm">
                  {(people[id] ?? "?").slice(0, 1).toUpperCase()}
                </span>
                {people[id] ?? "…"}
                {id === calendar.owner && (
                  <span className="font-medium text-muted text-sm">
                    · {t.app.share.owner}
                  </span>
                )}
              </span>
              {owner && id !== calendar.owner && (
                <Button
                  disabled={busy || !online}
                  onClick={() => remove(id)}
                  size="sm"
                  variant="ghost"
                >
                  {t.app.share.remove}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
      {owner && invites.length > 0 && (
        <div>
          <h3 className="mb-2 font-black text-lg">
            {t.app.share.invitesTitle}
          </h3>
          <ul className="flex flex-col gap-2">
            {invites.map((pending) => (
              <li
                className="scribble scribble-thin scribble-dashed flex items-center justify-between gap-2 rounded-2xl px-3 py-2"
                key={pending.id}
              >
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <Mail className="h-5 w-5 shrink-0" />
                  <span className="truncate">{pending.email}</span>
                </span>
                <Button
                  disabled={busy || !online}
                  onClick={() => revoke(pending.id)}
                  size="sm"
                  variant="ghost"
                >
                  {t.app.share.revoke}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
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
