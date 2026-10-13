"use client";

import { type FormEvent, useState } from "react";
import { Bang, Dot, Mail } from "@/components/doodles";
import { LocaleSwitch } from "@/components/locale-switch";
import { Button, buttonClass, Field, Notice } from "@/components/ui";
import {
  cancelEmailChange,
  deleteAccount,
  fetchExport,
  rename,
  requestEmailChange,
} from "@/features/accounts/client";
import { legalPath } from "@/features/legal/links";
import { clearAll } from "@/features/offline/db";
import { sync, useBoop } from "@/features/offline/store";
import { AccountNotifications } from "@/features/push/account-notifications";
import { Link } from "@/features/transitions/link";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { NameForm } from "./dialogs";
import { InvitationList } from "./invitations";
import { Sheet } from "./sheet";

/**
 * One's own account – opened from the account's menu (boop-app.tsx): the
 * invitations waiting for an answer, if any (invitations.tsx), its name,
 * its address (`Address`), the app's language, what is stored about it, and the ways out (the
 * data as a file, deleting it). All need a connection: the server has
 * the data, and the last word. Where an admin ticked the account's box in
 * the CMS, a link leads there – a shortcut and no more: the CMS asks for
 * its own login.
 *
 * Deleting asks twice: first what goes with the account, spelled out, then
 * the password – an open app on a table is not enough.
 */
export const AccountSheet = ({
  locale,
  onClose,
  onLocale,
  addressIn,
}: {
  locale: Locale;
  onClose: () => void;
  /** The app's language, changed in place (boop-app.tsx) – and its address in the other. */
  onLocale: (locale: Locale) => void;
  addressIn: (locale: Locale) => string;
}) => {
  const t = dictionaryOf(locale);
  const text = t.app.accountSheet;
  const { me, online } = useBoop();
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [exportFailed, setExportFailed] = useState(false);
  const [sure, setSure] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  // The new name is the server's at once; the app takes it over with the
  // sync – here and in every shared calendar.
  const saveName = async (name: string) => {
    setNameError(null);
    if (!navigator.onLine) {
      setNameError(t.auth.offline);
      return;
    }
    const result = await rename(name);
    if (!result.ok) {
      setNameError(text.nameFailed);
      return;
    }
    await sync();
  };

  const download = async () => {
    setBusy("export");
    setExportFailed(false);
    const file = await fetchExport();
    setBusy(null);
    if (!file) {
      setExportFailed(true);
      return;
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const remove = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("delete");
    setError(null);
    const result = await deleteAccount(password);
    if (!result.ok) {
      setBusy(null);
      const reasons: Record<string, string> = {
        wrong: text.wrongPassword,
        tooMany: text.tooMany,
      };
      setError(reasons[result.reason] ?? t.auth.failed);
      return;
    }
    // The account is gone, and the server logged out on the way. So goes
    // this device's copy – and, with a fresh page, what the app holds in
    // memory.
    await clearAll().catch(() => undefined);
    window.location.replace(`/${locale}`);
  };

  return (
    <Sheet onClose={onClose} title={text.title}>
      <InvitationList locale={locale} />
      <div className="flex flex-col gap-2">
        <NameForm
          label={text.name}
          maxLength={40}
          name={me?.name ?? ""}
          onSave={(name) => void saveName(name)}
          required
          save={t.app.save}
        />
        {nameError && <Notice tone="error">{nameError}</Notice>}
        <Address locale={locale} />
        {/* The app's language – here, not in the bar: it is rarely changed. */}
        <p className="flex items-center gap-3 font-medium text-muted text-sm">
          {text.language}
          <LocaleSwitch hrefOf={addressIn} locale={locale} onPick={onLocale} />
        </p>
        {/* In a tab of its own: the app stays open, with what waits in it. */}
        {me?.admin && (
          <a
            className={cn(
              buttonClass({ variant: "plain", size: "sm" }),
              "self-start"
            )}
            href="/admin"
            rel="noopener"
            target="_blank"
          >
            {text.cms}
          </a>
        )}
      </div>
      <p className="font-medium text-muted text-sm">
        {text.stored}{" "}
        <Link
          className="font-bold text-ink underline decoration-2 underline-offset-4 hover:decoration-[3px]"
          href={legalPath(locale)}
        >
          {text.privacy}
        </Link>
      </p>
      {!online && <Notice>{t.auth.offline}</Notice>}

      {/* What the whole account hears of – an invitation (push). */}
      <AccountNotifications locale={locale} />

      <div className="flex flex-col gap-2">
        <h3 className="font-black text-lg">{text.exportTitle}</h3>
        <p className="font-medium text-muted text-sm">{text.exportText}</p>
        <Button
          disabled={Boolean(busy) || !online}
          onClick={download}
          variant="plain"
        >
          {busy === "export" ? t.auth.working : text.export}
        </Button>
        {exportFailed && <Notice tone="error">{text.exportFailed}</Notice>}
      </div>

      {sure ? (
        // Watch out: a thick frame and an exclamation mark, like an error.
        <form
          className="scribble scribble-bold flex animate-fade flex-col gap-3 rounded-2xl p-4"
          onSubmit={remove}
        >
          <p className="flex items-start gap-2.5 font-bold">
            <Bang className="h-6 w-6 shrink-0" />
            {text.deleteLead}
          </p>
          <ul className="flex flex-col gap-1.5 font-medium text-sm">
            {text.deleteGone.map((line) => (
              <li className="flex items-start gap-2.5" key={line}>
                {/* A marker dot under the exclamation mark, on the first line. */}
                <span className="flex h-5 w-6 shrink-0 items-center justify-center">
                  <Dot className="h-2 w-2" />
                </span>
                {line}
              </li>
            ))}
          </ul>
          <p className="font-medium text-muted text-sm">{text.deleteTip}</p>
          <Field
            autoComplete="current-password"
            label={text.password}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              disabled={Boolean(busy)}
              onClick={() => {
                setSure(false);
                setPassword("");
                setError(null);
              }}
              size="sm"
              variant="ghost"
            >
              {t.app.draw.cancel}
            </Button>
            <Button
              disabled={Boolean(busy) || !online || !password}
              size="sm"
              type="submit"
              variant="danger"
            >
              {busy === "delete" ? t.auth.working : text.deleteForGood}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          className="self-start"
          onClick={() => setSure(true)}
          size="sm"
          variant="danger"
        >
          {text.delete}
        </Button>
      )}
    </Sheet>
  );
};

/**
 * The account's address, and the way to a new one: the new address and the
 * password – an open app on a table is not enough here either. The server
 * notes it and sends it a mail (accounts/email-change.ts); until that
 * mail's link was opened the old address counts. The sheet says so for as
 * long, with the way to take it back.
 */
const Address = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const text = t.app.accountSheet;
  const { me, online } = useBoop();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = me?.email ?? "";
  const kept = me?.pendingEmail ?? null;
  // What the server just answered shows at once; the sync brings it to the
  // device a moment later – from then on the device's copy says it (also
  // that the address was confirmed meanwhile: then `current` is another).
  const [answer, setAnswer] = useState<{
    email: string;
    pending: string | null;
  } | null>(null);
  if (answer && (answer.pending === kept || answer.email !== current)) {
    setAnswer(null);
  }
  const pending = answer ? answer.pending : kept;

  const close = () => {
    setOpen(false);
    setEmail("");
    setPassword("");
    setError(null);
  };

  const ask = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (email.trim().toLowerCase() === current.toLowerCase()) {
      setError(text.emailSame);
      return;
    }
    setBusy(true);
    const result = await requestEmailChange(email, password);
    setBusy(false);
    if (!result.ok) {
      const reasons: Record<string, string> = {
        wrong: text.wrongPassword,
        tooMany: text.tooMany,
        same: text.emailSame,
        invalid: text.emailInvalid,
      };
      setError(reasons[result.reason] ?? t.auth.failed);
      return;
    }
    setAnswer({ email: current, pending: result.value.pendingEmail ?? null });
    close();
    void sync();
  };

  const cancel = async () => {
    setBusy(true);
    setError(null);
    const result = await cancelEmailChange();
    setBusy(false);
    if (!result.ok) {
      setError(t.auth.failed);
      return;
    }
    setAnswer({ email: current, pending: null });
    void sync();
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-medium text-muted text-sm">
          {text.email(current)}
        </p>
        {!(open || pending) && (
          <Button
            className="shrink-0"
            disabled={!online}
            onClick={() => setOpen(true)}
            size="sm"
            variant="ghost"
          >
            {text.emailChange}
          </Button>
        )}
      </div>
      {pending ? (
        // Waiting – a dashed frame, like an invitation not taken up yet.
        <div className="scribble scribble-thin scribble-dashed flex animate-fade flex-col gap-2 rounded-2xl px-4 py-3">
          <p className="flex items-start gap-2.5 font-medium text-sm">
            <Mail className="h-5 w-5 shrink-0" />
            <span className="min-w-0 break-words">
              {text.emailPending(pending, current)}
            </span>
          </p>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex justify-end">
            <Button
              disabled={busy || !online}
              onClick={cancel}
              size="sm"
              variant="ghost"
            >
              {busy ? t.auth.working : text.emailCancel}
            </Button>
          </div>
        </div>
      ) : (
        open && (
          <form
            className="scribble scribble-thin flex animate-fade flex-col gap-3 rounded-2xl p-4"
            onSubmit={ask}
          >
            <p className="font-medium text-muted text-sm">{text.emailHint}</p>
            <Field
              autoComplete="email"
              autoFocus
              label={text.emailNew}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
            <Field
              autoComplete="current-password"
              label={text.password}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button disabled={busy} onClick={close} size="sm" variant="ghost">
                {t.app.draw.cancel}
              </Button>
              <Button
                disabled={busy || !online || !email.trim() || !password}
                size="sm"
                type="submit"
              >
                {busy ? t.auth.working : text.emailSend}
              </Button>
            </div>
          </form>
        )
      )}
    </>
  );
};
