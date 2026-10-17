"use client";

import { useState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import { legalPath } from "@/features/legal/links";
import { Link } from "@/features/transitions/link";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { register } from "../client";
import { Frame, TextLink, useSubmit } from "./frame";
import { NewPassword } from "./new-password";

/** Signing up – then a mail to confirm the address with. */
export const RegisterForm = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, run } = useSubmit(locale);
  if (done) {
    return (
      <Frame sticker="sun" title={t.auth.register.doneTitle}>
        <p className="font-medium text-lg">{t.auth.register.doneText}</p>
      </Frame>
    );
  }
  const reasons: Record<string, string> = {
    taken: t.auth.register.taken,
    tooMany: t.auth.register.tooMany,
  };
  return (
    <Frame sticker="flower" title={t.auth.register.title}>
      <form
        className="flex flex-col gap-4"
        onSubmit={run(async () => {
          const result = await register({ name, email, password, locale });
          if (!result.ok) return reasons[result.reason] ?? t.auth.failed;
          trackEvent("account-created");
          setDone(true);
          return null;
        })}
      >
        <Field
          autoComplete="nickname"
          label={t.auth.name}
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
        <Field
          autoComplete="email"
          label={t.auth.email}
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
        <NewPassword
          email={email}
          label={t.auth.password}
          locale={locale}
          name={name}
          onChange={setPassword}
          value={password}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button disabled={busy} size="lg" type="submit">
          {busy ? t.auth.working : t.auth.register.submit}
        </Button>
        <p className="text-muted text-xs">
          <Link
            className="underline underline-offset-4"
            href={legalPath(locale)}
          >
            {t.auth.register.privacy}
          </Link>
        </p>
      </form>
      <p className="font-medium text-muted text-sm">
        {t.auth.register.haveAccount}{" "}
        <TextLink href={`/${locale}/login`}>{t.nav.login}</TextLink>
      </p>
    </Frame>
  );
};
