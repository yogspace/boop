"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import { signedIn } from "@/features/offline/store";
import { useTransitionRouter } from "@/features/transitions/link";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { forgotPassword, resetPassword } from "../client";
import { Frame, useSubmit } from "./frame";
import { NewPassword } from "./new-password";
import { afterLogin } from "./pending-invite";

/**
 * A password forgotten: a mail with a link asked for, and the new password
 * set where the link leads – logged in with it at once.
 */

export const ForgotForm = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, run } = useSubmit(locale);
  if (done) {
    return (
      <Frame sticker="star" title={t.auth.forgot.doneTitle}>
        <p className="font-medium text-lg">{t.auth.forgot.doneText}</p>
      </Frame>
    );
  }
  return (
    <Frame sticker="cloud" title={t.auth.forgot.title}>
      <p className="font-medium text-muted">{t.auth.forgot.text}</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={run(async () => {
          await forgotPassword(email);
          // The same answer either way – nobody learns which addresses exist.
          trackEvent("password-reset-requested");
          setDone(true);
          return null;
        })}
      >
        <Field
          autoComplete="email"
          label={t.auth.email}
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button disabled={busy} size="lg" type="submit">
          {busy ? t.auth.working : t.auth.forgot.submit}
        </Button>
      </form>
    </Frame>
  );
};

export const ResetForm = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const router = useTransitionRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const { busy, error, run } = useSubmit(locale);
  return (
    <Frame sticker="star" title={t.auth.reset.title}>
      <form
        className="flex flex-col gap-4"
        onSubmit={run(async () => {
          const result = await resetPassword(token, password);
          if (!result.ok) return t.auth.reset.invalid;
          await afterLogin();
          await signedIn(result.value);
          trackEvent("password-reset");
          router.replace(`/${locale}/app`);
          return null;
        })}
      >
        <NewPassword
          label={t.auth.newPassword}
          locale={locale}
          onChange={setPassword}
          value={password}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button disabled={busy || !token} size="lg" type="submit">
          {busy ? t.auth.working : t.auth.reset.submit}
        </Button>
      </form>
    </Frame>
  );
};
