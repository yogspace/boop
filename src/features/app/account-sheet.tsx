"use client";

import { type FormEvent, useState } from "react";
import { Bang, Dot } from "@/components/doodles";
import { Button, Field, Notice } from "@/components/ui";
import { deleteAccount, fetchExport, rename } from "@/features/accounts/client";
import { legalPath } from "@/features/legal/links";
import { clearAll } from "@/features/offline/db";
import { sync, useBoop } from "@/features/offline/store";
import { Link } from "@/features/transitions/link";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { NameForm } from "./dialogs";
import { Sheet } from "./sheet";

/**
 * One's own account – opened from the account's menu (boop-app.tsx): its
 * name, what is stored about it, and the ways out (the data as a file,
 * deleting it). All need a connection: the server has the data, and the
 * last word. (The address can't be changed yet – a new one would need
 * confirming.)
 *
 * Deleting asks twice: first what goes with the account, spelled out, then
 * the password – an open app on a table is not enough.
 */
export const AccountSheet = ({
  locale,
  onClose,
}: {
  locale: Locale;
  onClose: () => void;
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
        <p className="truncate font-medium text-muted text-sm">
          {text.email(me?.email ?? "")}
        </p>
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
        <Button onClick={() => setSure(true)} size="sm" variant="ghost">
          {text.delete}
        </Button>
      )}
    </Sheet>
  );
};
