"use client";

import { useState } from "react";
import { Button, Checkbox, Field, Notice } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import { signedIn } from "@/features/offline/store";
import { useTransitionRouter } from "@/features/transitions/link";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { login } from "../client";
import { Frame, TextLink, useSubmit } from "./frame";
import { afterLogin } from "./pending-invite";

/**
 * Logging in – then into the app, an invitation waiting on this device
 * taken up on the way (pending-invite.ts).
 */
export const LoginForm = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const router = useTransitionRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Ticked to begin with: Boop is opened daily, and installed as an app
  // there is no browser to close. Unticked, the login ends with the browser.
  const [remember, setRemember] = useState(true);
  const { busy, error, run } = useSubmit(locale);
  const reasons: Record<string, string> = {
    wrong: t.auth.login.wrong,
    unverified: t.auth.login.unverified,
    locked: t.auth.login.locked,
  };
  return (
    <Frame sticker="smile" title={t.auth.login.title}>
      <form
        className="flex flex-col gap-4"
        onSubmit={run(async () => {
          const result = await login(email, password, remember);
          if (!result.ok) return reasons[result.reason] ?? t.auth.failed;
          await afterLogin();
          await signedIn(result.value);
          trackEvent("login");
          router.replace(`/${locale}/app`);
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
        <Field
          autoComplete="current-password"
          label={t.auth.password}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
        <div className="flex flex-col gap-1.5">
          <Checkbox
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          >
            {t.auth.login.remember}
          </Checkbox>
          {!remember && (
            <p className="animate-fade text-muted text-xs">
              {t.auth.login.rememberOff}
            </p>
          )}
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <Button disabled={busy} size="lg" type="submit">
          {busy ? t.auth.working : t.auth.login.submit}
        </Button>
      </form>
      <div className="flex flex-col gap-2 text-sm">
        <TextLink href={`/${locale}/forgot-password`}>
          {t.auth.login.forgot}
        </TextLink>
        <span className="font-medium text-muted">
          {t.auth.login.noAccount}{" "}
          <TextLink href={`/${locale}/register`}>{t.nav.register}</TextLink>
        </span>
      </div>
    </Frame>
  );
};
