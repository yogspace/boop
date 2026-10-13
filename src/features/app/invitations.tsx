"use client";

import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import type { Snapshot } from "valtio";
import { Button, Notice } from "@/components/ui";
import { hexOf } from "@/features/calendar/palette";
import {
  acceptInvitation,
  boop,
  declineInvitation,
  useBoop,
} from "@/features/offline/store";
import type { InvitationDoc } from "@/features/sync/protocol";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { Sheet } from "./sheet";

/**
 * Invitations to the account – they come with the sync and wait on the
 * device, offline too (offline/store.ts). Each pops up (`Invitations`), one
 * after the other, until it is answered or put off for later; the account
 * sheet lists them all (`InvitationList`). A yes or a no needs a
 * connection: the server decides, and the sync brings what came of it –
 * after a yes, the calendar.
 */

type Invitation = Snapshot<InvitationDoc>;

/** Where this tab keeps what was put off for later – until it closes. */
const LATER = "boop-invitations-later";

const putOff = {
  read: (): string[] => {
    try {
      const ids: unknown = JSON.parse(sessionStorage.getItem(LATER) ?? "[]");
      return Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  },
  write: (ids: string[]) => {
    try {
      sessionStorage.setItem(LATER, JSON.stringify(ids));
    } catch {
      // No storage – put off until the page goes.
    }
  },
};

/**
 * “26. Oktober um 09:00” – until when an invitation can be taken up, to the
 * minute, as its page says it (accounts/forms.tsx).
 */
const momentOf = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleString(locale === "de" ? "de-DE" : "en-GB", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

/** “Anna invites you to ‘Family’” – the calendar's color as a dot before it. */
const Line = ({
  invitation,
  locale,
  className,
}: {
  invitation: Invitation;
  locale: Locale;
  className?: string;
}) => (
  <p className={cn("flex items-start gap-2.5 font-medium", className)}>
    <span className="flex h-[1lh] shrink-0 items-center">
      <span
        className="h-3 w-3 rounded-full border-2 border-current"
        style={{ background: hexOf(invitation.color) }}
      />
    </span>
    <span className="wrap-break-word min-w-0">
      {dictionaryOf(locale).app.invitations.text(
        invitation.from,
        invitation.calendar
      )}
    </span>
  </p>
);

/**
 * The invitation that pops up: the oldest one not put off in this tab yet,
 * once the app shows the account's calendars. Put off – “later”, or closed
 * – it waits in the account sheet. Mount it once, beside the app's sheets.
 *
 * `hold`: something else lies over the app (a sheet, the menu) – it waits
 * for that to go, as two sheets at once would undo each other's hold on the
 * page (sheet.tsx). `onJoined`: a yes, and the calendar is on the device.
 * `onShowing`: whether it lies over the app now – the today view's keys
 * rest meanwhile.
 */
export const Invitations = ({
  locale,
  hold = false,
  onJoined,
  onShowing,
}: {
  locale: Locale;
  hold?: boolean;
  onJoined?: (calendar: string) => void;
  onShowing?: (showing: boolean) => void;
}) => {
  const { status, invitations } = useBoop();
  const [later, setLater] = useState(() =>
    typeof window === "undefined" ? [] : putOff.read()
  );
  // One that is no more when it is taken up stays, saying so, until closed –
  // the sync takes it off the device meanwhile.
  const [gone, setGone] = useState<Invitation | null>(null);
  const next = invitations.find((invitation) => !later.includes(invitation.id));
  const shown = gone ?? (status === "ready" && !hold ? next : undefined);
  const showing = Boolean(shown);
  useEffect(() => onShowing?.(showing), [showing, onShowing]);

  const close = (id: string) => {
    setGone(null);
    const ids = [...later, id];
    setLater(ids);
    putOff.write(ids);
  };

  return (
    // One goes before the next comes (`hold`, above).
    <AnimatePresence mode="wait">
      {shown && (
        <InvitationSheet
          gone={gone?.id === shown.id}
          invitation={shown}
          key={shown.id}
          locale={locale}
          onClose={() => close(shown.id)}
          onGone={() => setGone(shown)}
          onJoined={onJoined}
        />
      )}
    </AnimatePresence>
  );
};

const InvitationSheet = ({
  invitation,
  gone,
  locale,
  onClose,
  onGone,
  onJoined,
}: {
  invitation: Invitation;
  gone: boolean;
  locale: Locale;
  onClose: () => void;
  onGone: () => void;
  onJoined?: (calendar: string) => void;
}) => {
  const t = dictionaryOf(locale);
  const text = t.app.invitations;
  const { online } = useBoop();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [failed, setFailed] = useState(false);

  // A yes or a no takes it off the device – and the sheet goes with it.
  const accept = async () => {
    setBusy("accept");
    setFailed(false);
    const result = await acceptInvitation(invitation.id);
    setBusy(null);
    if (result.ok) {
      if (boop.calendars[result.calendar]) onJoined?.(result.calendar);
    } else if (result.reason === "gone") onGone();
    else setFailed(true);
  };

  const decline = async () => {
    setBusy("decline");
    setFailed(false);
    const ok = await declineInvitation(invitation.id);
    setBusy(null);
    if (!ok) setFailed(true);
  };

  return (
    <Sheet onClose={onClose} title={text.popupTitle}>
      <Line className="text-lg" invitation={invitation} locale={locale} />
      {gone ? (
        // No alarm – there is simply nothing left to answer.
        <Notice>{text.gone(invitation.calendar)}</Notice>
      ) : (
        !online && <Notice>{text.offline}</Notice>
      )}
      {failed && <Notice tone="error">{t.auth.failed}</Notice>}
      {/* On a phone the yes on its own line, on top; wider, all in a row. */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
        {gone ? (
          <Button className="col-span-2" onClick={onClose} variant="plain">
            {text.close}
          </Button>
        ) : (
          <>
            <Button onClick={onClose} variant="ghost">
              {text.later}
            </Button>
            <Button
              disabled={Boolean(busy) || !online}
              onClick={decline}
              variant="plain"
            >
              {busy === "decline" ? t.auth.working : text.decline}
            </Button>
            <Button
              className="col-span-2 -order-1 sm:order-none"
              disabled={Boolean(busy) || !online}
              onClick={accept}
            >
              {busy === "accept" ? t.auth.working : text.accept}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
};

/**
 * Every open invitation, each with its yes and no – a section of the
 * account sheet while there are any. After a yes the sheet stays: the
 * calendar turns up in the bar, and a word here says so.
 */
export const InvitationList = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const text = t.app.invitations;
  const { invitations, online } = useBoop();
  const [busy, setBusy] = useState<{
    id: string;
    what: "accept" | "decline";
  } | null>(null);
  const [notice, setNotice] = useState<{
    tone: "info" | "success" | "error";
    text: string;
  } | null>(null);

  const accept = async (invitation: Invitation) => {
    setBusy({ id: invitation.id, what: "accept" });
    setNotice(null);
    const result = await acceptInvitation(invitation.id);
    setBusy(null);
    if (result.ok) {
      setNotice({ tone: "success", text: text.joined(invitation.calendar) });
    } else if (result.reason === "gone") {
      setNotice({ tone: "info", text: text.gone(invitation.calendar) });
    } else setNotice({ tone: "error", text: t.auth.failed });
  };

  const decline = async (invitation: Invitation) => {
    setBusy({ id: invitation.id, what: "decline" });
    setNotice(null);
    const ok = await declineInvitation(invitation.id);
    setBusy(null);
    if (!ok) setNotice({ tone: "error", text: t.auth.failed });
  };

  const said = notice && <Notice tone={notice.tone}>{notice.text}</Notice>;
  if (!invitations.length) return said;
  const working = (id: string, what: "accept" | "decline") =>
    busy?.id === id && busy.what === what;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-black text-lg">{text.title}</h3>
      <ul className="flex flex-col gap-2">
        {invitations.map((invitation) => (
          // Waiting – a dashed frame, like an invitation the owner sees.
          <li
            className="scribble scribble-thin scribble-dashed flex animate-fade flex-col gap-2 rounded-2xl px-4 py-3"
            key={invitation.id}
          >
            <Line className="text-sm" invitation={invitation} locale={locale} />
            <p className="font-medium text-muted text-xs">
              {text.until(momentOf(invitation.expiresAt, locale))}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                disabled={Boolean(busy) || !online}
                onClick={() => decline(invitation)}
                size="sm"
                variant="ghost"
              >
                {working(invitation.id, "decline")
                  ? t.auth.working
                  : text.decline}
              </Button>
              <Button
                disabled={Boolean(busy) || !online}
                onClick={() => accept(invitation)}
                size="sm"
              >
                {working(invitation.id, "accept")
                  ? t.auth.working
                  : text.accept}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {!online && (
        <p className="font-medium text-muted text-sm">{text.offline}</p>
      )}
      {said}
    </div>
  );
};
