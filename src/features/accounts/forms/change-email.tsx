"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, LinkButton, Notice } from "@/components/ui";
import { getMeta, write } from "@/features/offline/db";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { confirmEmailChange, fetchMe, type Me } from "../client";
import { Frame, useSubmit } from "./frame";

/**
 * After the address changed: logged in here as that account, this device's
 * copy says so at once – the public pages' account menu reads it
 * (account-button.tsx). The app takes it over with its next sync anyway.
 */
const refreshMe = async () => {
  const [kept, fresh] = await Promise.all([getMeta<Me>("me"), fetchMe()]);
  if (kept && fresh && kept.id === fresh.id) {
    await write([{ store: "meta", put: fresh, key: "me" }]);
  }
};

/**
 * The link in the mail to a new address (email-change.ts) leads here, and
 * one click confirms it. A click, not the opening itself: a mail program
 * that follows links before anyone reads the mail must not hand an account
 * over to a mailbox the mail reached by a slip of the keys. No login is
 * needed – and none made: whoever is logged in stays so, and the app shows
 * the new address after its next sync.
 */
export const ChangeEmailPanel = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const text = t.auth.changeEmail;
  const token = useSearchParams().get("token") ?? "";
  // What came of the link – nothing yet, while it waits for the click.
  const [outcome, setOutcome] = useState<"done" | "invalid" | "taken" | null>(
    null
  );
  const { busy, error, run } = useSubmit(locale);
  const shown = token ? outcome : "invalid";

  if (shown === "done") {
    return (
      <Frame sticker="heart" title={text.title}>
        <Notice tone="success">{text.done}</Notice>
        {/* Not logged in on this device: the app leads on to the login. */}
        <LinkButton href={`/${locale}/app`} size="lg">
          {text.toApp}
        </LinkButton>
      </Frame>
    );
  }
  // Too late, used, or someone else's by now: no alarm – it says what to do.
  if (shown) {
    return (
      <Frame sticker="cloud" title={text.title}>
        <p className="font-medium text-lg">
          {shown === "taken" ? text.taken : text.failed}
        </p>
        <LinkButton href={`/${locale}/app`} size="lg">
          {text.toApp}
        </LinkButton>
      </Frame>
    );
  }
  return (
    <Frame sticker="star" title={text.title}>
      <p className="font-medium text-lg">{text.text}</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={run(async () => {
          const result = await confirmEmailChange(token);
          if (result.ok) {
            void refreshMe().catch(() => undefined);
            setOutcome("done");
            return null;
          }
          // The server couldn't be asked – the link is as good as before.
          if (result.reason === "failed") return t.auth.failed;
          setOutcome(result.reason === "taken" ? "taken" : "invalid");
          return null;
        })}
      >
        {error && <Notice tone="error">{error}</Notice>}
        <Button disabled={busy} size="lg" type="submit">
          {busy ? t.auth.working : text.submit}
        </Button>
      </form>
    </Frame>
  );
};
