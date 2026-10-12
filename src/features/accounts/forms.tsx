"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button, Card, Field, Notice } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import { legalPath } from "@/features/legal/links";
import { signedIn } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import {
  forgotPassword,
  login,
  register,
  resetPassword,
  verifyEmail,
} from "./client";

/**
 * The account pages' forms: log in, sign up, forgot password, new password,
 * confirm address. Each talks to Payload through ./client.ts.
 */

const Frame = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="mx-auto w-full max-w-md px-4 py-10">
    <Card className="flex flex-col gap-5">
      <h1 className="font-bold font-doodle text-4xl">{title}</h1>
      {children}
    </Card>
  </div>
);

/** Shared form state: busy, error, and a guard against being offline. */
const useSubmit = (locale: Locale) => {
  const t = dictionaryOf(locale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run =
    (work: () => Promise<string | null>) => async (event: FormEvent) => {
      event.preventDefault();
      if (!navigator.onLine) {
        setError(t.auth.offline);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        setError(await work());
      } catch {
        setError(t.auth.failed);
      } finally {
        setBusy(false);
      }
    };
  return { busy, error, run };
};

export const LoginForm = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useSubmit(locale);
  const reasons: Record<string, string> = {
    wrong: t.auth.login.wrong,
    unverified: t.auth.login.unverified,
    locked: t.auth.login.locked,
  };
  return (
    <Frame title={t.auth.login.title}>
      <form
        className="flex flex-col gap-4"
        onSubmit={run(async () => {
          const result = await login(email, password);
          if (!result.ok) return reasons[result.reason] ?? t.auth.failed;
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
        {error && <Notice tone="error">{error}</Notice>}
        <Button disabled={busy} type="submit">
          {busy ? t.auth.working : t.auth.login.submit}
        </Button>
      </form>
      <div className="flex flex-col gap-1 text-sm">
        <Link
          className="underline underline-offset-4"
          href={`/${locale}/forgot-password`}
        >
          {t.auth.login.forgot}
        </Link>
        <span>
          {t.auth.login.noAccount}{" "}
          <Link
            className="font-bold underline underline-offset-4"
            href={`/${locale}/register`}
          >
            {t.nav.register}
          </Link>
        </span>
      </div>
    </Frame>
  );
};

export const RegisterForm = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, run } = useSubmit(locale);
  if (done) {
    return (
      <Frame title={t.auth.register.doneTitle}>
        <p>{t.auth.register.doneText}</p>
      </Frame>
    );
  }
  const reasons: Record<string, string> = {
    taken: t.auth.register.taken,
    tooMany: t.auth.register.tooMany,
  };
  return (
    <Frame title={t.auth.register.title}>
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
        <Field
          autoComplete="new-password"
          hint={t.auth.passwordHint}
          label={t.auth.password}
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button disabled={busy} type="submit">
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
      <p className="text-sm">
        {t.auth.register.haveAccount}{" "}
        <Link
          className="font-bold underline underline-offset-4"
          href={`/${locale}/login`}
        >
          {t.nav.login}
        </Link>
      </p>
    </Frame>
  );
};

export const ForgotForm = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, run } = useSubmit(locale);
  if (done) {
    return (
      <Frame title={t.auth.forgot.doneTitle}>
        <p>{t.auth.forgot.doneText}</p>
      </Frame>
    );
  }
  return (
    <Frame title={t.auth.forgot.title}>
      <p className="text-muted">{t.auth.forgot.text}</p>
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
        <Button disabled={busy} type="submit">
          {busy ? t.auth.working : t.auth.forgot.submit}
        </Button>
      </form>
    </Frame>
  );
};

export const ResetForm = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const { busy, error, run } = useSubmit(locale);
  return (
    <Frame title={t.auth.reset.title}>
      <form
        className="flex flex-col gap-4"
        onSubmit={run(async () => {
          const result = await resetPassword(token, password);
          if (!result.ok) return t.auth.reset.invalid;
          await signedIn(result.value);
          trackEvent("password-reset");
          router.replace(`/${locale}/app`);
          return null;
        })}
      >
        <Field
          autoComplete="new-password"
          hint={t.auth.passwordHint}
          label={t.auth.newPassword}
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button disabled={busy || !token} type="submit">
          {busy ? t.auth.working : t.auth.reset.submit}
        </Button>
      </form>
    </Frame>
  );
};

export const VerifyPanel = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  // Once – a token works only one time (strict mode runs effects twice).
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (!token) {
      setState("failed");
      return;
    }
    verifyEmail(token)
      .then((result) => {
        setState(result.ok ? "done" : "failed");
        if (result.ok) trackEvent("account-verified");
      })
      .catch(() => setState("failed"));
  }, [token]);
  return (
    <Frame title={t.auth.verify.title}>
      {state === "working" && <p>{t.auth.verify.working}</p>}
      {state === "done" && <Notice tone="success">{t.auth.verify.done}</Notice>}
      {state === "failed" && (
        <Notice tone="error">{t.auth.verify.failed}</Notice>
      )}
      {state !== "working" && (
        <Link
          className="font-bold underline underline-offset-4"
          href={`/${locale}/login`}
        >
          {t.auth.verify.toLogin}
        </Link>
      )}
    </Frame>
  );
};
