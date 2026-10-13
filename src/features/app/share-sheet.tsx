"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import type { Snapshot } from "valtio";
import { Bang, Mail } from "@/components/doodles";
import { Button, Field, Notice } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import type { CalendarDoc } from "@/features/calendar/model";
import { sync, useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { Sheet } from "./sheet";

/**
 * Sharing a calendar – its owner's: inviting by email, and taking an
 * invitation back. Every address gets an invitation – one with an account
 * sees it in the app, too – and is in once it says yes; until then it waits
 * here. The server answers the same for every address, so this says
 * “invited” whatever it is. Below, who is in it already (`Members`). Needs
 * a connection: the server decides.
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
  const { me, online } = useBoop();
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
    setNotice(null);
    // One's own address – the server would take it in silence.
    if (email.trim().toLowerCase() === me?.email.toLowerCase()) {
      setNotice({ tone: "error", text: t.app.share.yourself });
      return;
    }
    setBusy(true);
    const response = await fetch(`${base}/members`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      invited?: boolean;
    } | null;
    setBusy(false);
    if (body?.invited) {
      setNotice({ tone: "success", text: t.app.share.invited(email.trim()) });
      setEmail("");
      trackEvent("calendar-shared");
      await loadInvites();
    } else {
      setNotice({ tone: "error", text: t.app.share.notFound });
    }
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
      <Members calendar={calendar} locale={locale} />
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
      <LeaveCalendar calendar={calendar} locale={locale} onLeft={onClose} />
    </Sheet>
  );
};

/**
 * Takes an account out of a calendar – the owner someone else, a member
 * themselves. The server's call; the next sync brings what came of it.
 */
const takeOut = (calendar: string, account: string) =>
  fetch(`/api/calendars/${calendar}/members/${account}`, {
    method: "DELETE",
    credentials: "include",
  }).catch(() => null);

/**
 * Who is in a calendar, the owner marked – in the share sheet and in the
 * calendar's settings. The owner removes people; anyone else just reads
 * (their own way out: `LeaveCalendar`). Needs a connection: the server
 * decides.
 */
export const Members = ({
  calendar,
  locale,
  quiet = false,
  action,
}: {
  calendar: Snapshot<CalendarDoc>;
  locale: Locale;
  /** The heading as a label, like a field's – one of several in a form. */
  quiet?: boolean;
  /** Something to do beside the heading – the way to the invitations. */
  action?: ReactNode;
}) => {
  const t = dictionaryOf(locale);
  const { me, people, online } = useBoop();
  const [busy, setBusy] = useState(false);
  const owner = calendar.owner === me?.id;

  const remove = async (account: string) => {
    setBusy(true);
    await takeOut(calendar.id, account);
    setBusy(false);
    await sync();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className={quiet ? "font-bold text-sm" : "font-black text-lg"}>
          {t.app.share.members}
        </h3>
        {action}
      </div>
      <ul className="flex flex-col gap-2">
        {calendar.members.map((id) => (
          <li
            className="scribble scribble-bare scribble-soft flex items-center justify-between gap-2 rounded-2xl px-3 py-2"
            key={id}
          >
            <span className="flex min-w-0 items-center gap-2 font-bold">
              <span className="scribble scribble-sm scribble-thin flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-black text-sm">
                {(people[id] ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="wrap-break-word min-w-0">
                {people[id] ?? "…"}
              </span>
              {id === calendar.owner && (
                <span className="shrink-0 font-medium text-muted text-sm">
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
  );
};

/**
 * A member's way out of a calendar that isn't theirs (`onLeft`: gone from
 * it – whatever showed the calendar closes). Needs a connection, too.
 */
export const LeaveCalendar = ({
  calendar,
  locale,
  onLeft,
}: {
  calendar: Snapshot<CalendarDoc>;
  locale: Locale;
  onLeft: () => void;
}) => {
  const t = dictionaryOf(locale);
  const { me, online, people } = useBoop();
  const [busy, setBusy] = useState(false);
  // Asked once – coming back takes the owner's invitation.
  const [asked, setAsked] = useState(false);
  if (!me || calendar.owner === me.id) return null;

  const leave = async () => {
    setBusy(true);
    await takeOut(calendar.id, me.id);
    setBusy(false);
    await sync();
    onLeft();
  };

  if (!asked) {
    return (
      <Button
        className="self-start"
        disabled={!online}
        onClick={() => setAsked(true)}
        size="sm"
        variant="ghost"
      >
        {t.app.share.leave}
      </Button>
    );
  }
  return (
    <div className="scribble scribble-bold flex animate-fade flex-col gap-3 rounded-2xl p-4">
      <p className="flex items-start gap-2.5 font-bold">
        <Bang className="h-6 w-6 shrink-0" />
        <span className="wrap-break-word min-w-0">
          {t.app.share.leaveAsk(people[calendar.owner] ?? "…")}
        </span>
      </p>
      <div className="flex justify-end gap-2">
        <Button onClick={() => setAsked(false)} size="sm" variant="ghost">
          {t.app.draw.cancel}
        </Button>
        <Button
          disabled={busy || !online}
          onClick={leave}
          size="sm"
          variant="danger"
        >
          {t.app.share.leaveYes}
        </Button>
      </div>
    </div>
  );
};
