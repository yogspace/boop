"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LinkButton, Notice } from "@/components/ui";
import { useTransitionRouter } from "@/features/transitions/link";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { fetchMe } from "../client";
import { Frame } from "./frame";
import { acceptInvite, pendingInvite } from "./pending-invite";

/** What the server says to an invitation's link (calendar/invites.ts). */
type Invitation =
  | { state: "open"; calendar: string; from: string; until: string | null }
  /** Too late – `from` is whom to ask for a new one. */
  | { state: "expired"; from: string }
  /** Used, taken back, or never there. */
  | { state: "missing" };

const readInvite = async (token: string): Promise<Invitation> => {
  const response = await fetch(`/api/invites/${encodeURIComponent(token)}`);
  const body = (await response.json().catch(() => null)) as {
    calendar?: string;
    from?: string;
    expiresAt?: string | null;
  } | null;
  if (response.status === 410) {
    return { state: "expired", from: body?.from ?? "" };
  }
  if (!(response.ok && body)) return { state: "missing" };
  return {
    state: "open",
    calendar: body.calendar ?? "",
    from: body.from ?? "",
    until: body.expiresAt ?? null,
  };
};

/**
 * “26. Oktober um 09:00” – until when an invitation can be taken up, to the
 * minute: a day alone would promise its evening too.
 */
const momentOf = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleString(locale === "de" ? "de-DE" : "en-GB", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * The invitation's page – where the mail's link leads. Following it is the
 * yes: logged in already, the calendar is joined at once and the app opens;
 * otherwise after logging in or signing up (`afterLogin`,
 * pending-invite.ts).
 */
export const InvitePanel = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const router = useTransitionRouter();
  const token = useSearchParams().get("token") ?? "";
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [account, setAccount] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) {
      setInvite({ state: "missing" });
      return;
    }
    readInvite(token)
      .then(setInvite)
      .catch(() => setInvite({ state: "missing" }));
    fetchMe()
      .then((me) => setAccount(Boolean(me)))
      .catch(() => setAccount(false));
  }, [token]);

  // Logged in: taken up – once (strict mode runs effects twice). Gone
  // meanwhile, the page says why, fresh from the server.
  const joining = useRef(false);
  const open = invite?.state === "open";
  useEffect(() => {
    if (!(account && open) || joining.current) return;
    joining.current = true;
    void acceptInvite(token).then(async (ok) => {
      if (ok) {
        router.replace(`/${locale}/app`);
        return;
      }
      setInvite(
        await readInvite(token).catch((): Invitation => ({ state: "missing" }))
      );
    });
  }, [account, open, token, locale, router]);

  // Too late: no alarm – it says how long invitations last and what to do.
  if (invite?.state === "expired") {
    return (
      <Frame sticker="cloud" title={t.auth.invite.expiredTitle}>
        <p className="font-medium text-lg">
          {t.auth.invite.expired(invite.from)}
        </p>
      </Frame>
    );
  }
  if (invite?.state === "missing") {
    return (
      <Frame sticker="cloud" title={t.auth.invite.title}>
        <Notice tone="error">{t.auth.invite.invalid}</Notice>
      </Frame>
    );
  }
  if (!invite || account === null) {
    return <Frame title={t.auth.invite.title}>{t.app.loading}</Frame>;
  }

  return (
    <Frame sticker="heart" title={t.auth.invite.title}>
      <p className="font-medium text-lg">
        {t.auth.invite.text(invite.from, invite.calendar)}
      </p>
      {account ? (
        <p className="-mt-3 font-medium text-muted text-sm">{t.auth.working}</p>
      ) : (
        <>
          {invite.until && (
            <p className="-mt-3 font-medium text-muted text-sm">
              {t.auth.invite.until(momentOf(invite.until, locale))}
            </p>
          )}
          <p className="font-medium text-muted">{t.auth.invite.account}</p>
          <div className="flex flex-wrap gap-3">
            <LinkButton
              href={`/${locale}/register`}
              onClick={() => pendingInvite.set(token)}
              size="lg"
            >
              {t.nav.register}
            </LinkButton>
            <LinkButton
              href={`/${locale}/login`}
              onClick={() => pendingInvite.set(token)}
              size="lg"
              variant="plain"
            >
              {t.nav.login}
            </LinkButton>
          </div>
        </>
      )}
    </Frame>
  );
};
