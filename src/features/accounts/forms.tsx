"use client";

import { useSearchParams } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Star, Ticks } from "@/components/doodles";
import { Button, Checkbox, Field, LinkButton, Notice } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import { legalPath } from "@/features/legal/links";
import { signedIn } from "@/features/offline/store";
import { demoStamp } from "@/features/stickers/demo";
import { Sticker } from "@/features/stickers/sticker";
import { Link, useTransitionRouter } from "@/features/transitions/link";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import {
  confirmEmailChange,
  fetchMe,
  forgotPassword,
  login,
  register,
  resetPassword,
  verifyEmail,
} from "./client";

/**
 * The account pages' forms: log in, sign up, forgot password, new password,
 * confirm address, confirm a new address, invitation. Each talks to the
 * server through ./client.ts.
 */

/** An invitation opened before logging in – taken up after the login. */
const INVITE_KEY = "boop-invite";

const pendingInvite = {
  get: () => {
    try {
      return localStorage.getItem(INVITE_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null) => {
    try {
      if (token) localStorage.setItem(INVITE_KEY, token);
      else localStorage.removeItem(INVITE_KEY);
    } catch {
      // No storage – the address's own invitations still join at login.
    }
  },
};

const acceptInvite = async (token: string) => {
  const response = await fetch(
    `/api/invites/${encodeURIComponent(token)}/accept`,
    { method: "POST", credentials: "include" }
  ).catch(() => null);
  return Boolean(response?.ok);
};

/** After any login: an invitation waiting on this device is taken up. */
const afterLogin = async () => {
  const token = pendingInvite.get();
  if (!token) return;
  await acceptInvite(token);
  pendingInvite.set(null);
};

const Frame = ({
  title,
  sticker = "heart",
  children,
}: {
  title: string;
  sticker?: string;
  children: ReactNode;
}) => (
  <div className="mx-auto w-full max-w-md px-4 pt-12 pb-16">
    {/* A scribbled sheet; the sticker on its corner is the only color. */}
    <div className="scribble rounded-[32px] p-6 sm:p-8">
      <div
        className="absolute -top-10 -right-1 w-24 animate-float sm:-right-4"
        style={{ "--tilt": "10deg" } as React.CSSProperties}
      >
        <Sticker stamp={demoStamp(sticker)} />
      </div>
      <Ticks className="absolute -top-8 right-[4.75rem] h-5 w-8 -rotate-[38deg] sm:right-[5.5rem]" />
      <Star className="absolute -top-3.5 left-8 h-7 w-7 -rotate-12" />
      <h1 className="mb-6 pr-16 text-4xl">{title}</h1>
      <div className="flex flex-col gap-5">{children}</div>
    </div>
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

const TextLink = (props: React.ComponentProps<typeof Link>) => (
  <Link
    className="font-bold text-ink underline decoration-2 underline-offset-4 hover:decoration-[3px]"
    {...props}
  />
);

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
        <Button disabled={busy || !token} size="lg" type="submit">
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
    <Frame
      sticker={state === "done" ? "heart" : "cloud"}
      title={t.auth.verify.title}
    >
      {state === "working" && (
        <p className="font-medium">{t.auth.verify.working}</p>
      )}
      {state === "done" && <Notice tone="success">{t.auth.verify.done}</Notice>}
      {state === "failed" && (
        <Notice tone="error">{t.auth.verify.failed}</Notice>
      )}
      {state !== "working" && (
        <LinkButton href={`/${locale}/login`} size="lg">
          {t.auth.verify.toLogin}
        </LinkButton>
      )}
    </Frame>
  );
};

/**
 * The link in the mail to a new address (email-change.ts): opening it is
 * the confirmation. No login needed – and none made: whoever is logged in
 * stays so, and the app shows the new address after its next sync.
 */
export const ChangeEmailPanel = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const text = t.auth.changeEmail;
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<
    "working" | "done" | "invalid" | "taken" | "failed" | "offline"
  >("working");
  // Once – a token works only one time (strict mode runs effects twice).
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (!token) {
      setState("invalid");
      return;
    }
    // The server couldn't be asked: the link is as good as before.
    const unasked = () => setState(navigator.onLine ? "failed" : "offline");
    confirmEmailChange(token)
      .then((result) => {
        if (result.ok) setState("done");
        else if (result.reason === "failed") unasked();
        else setState(result.reason === "taken" ? "taken" : "invalid");
      })
      .catch(unasked);
  }, [token]);
  return (
    <Frame sticker={state === "done" ? "heart" : "cloud"} title={text.title}>
      {state === "working" && <p className="font-medium">{text.working}</p>}
      {state === "done" && <Notice tone="success">{text.done}</Notice>}
      {state === "invalid" && <Notice tone="error">{text.failed}</Notice>}
      {state === "taken" && <Notice tone="error">{text.taken}</Notice>}
      {state === "failed" && <Notice tone="error">{t.auth.failed}</Notice>}
      {state === "offline" && <Notice tone="error">{t.auth.offline}</Notice>}
      {/* Not logged in on this device: the app leads on to the login. */}
      {state !== "working" && (
        <LinkButton href={`/${locale}/app`} size="lg">
          {text.toApp}
        </LinkButton>
      )}
    </Frame>
  );
};

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

export const InvitePanel = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const router = useTransitionRouter();
  const token = useSearchParams().get("token") ?? "";
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [account, setAccount] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

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

  const accept = async () => {
    setBusy(true);
    const ok = await acceptInvite(token);
    setBusy(false);
    if (ok) router.replace(`/${locale}/app`);
    // Gone meanwhile – the page says why, fresh from the server.
    else {
      setInvite(
        await readInvite(token).catch((): Invitation => ({ state: "missing" }))
      );
    }
  };

  return (
    <Frame sticker="heart" title={t.auth.invite.title}>
      <p className="font-medium text-lg">
        {t.auth.invite.text(invite.from, invite.calendar)}
      </p>
      {invite.until && (
        <p className="-mt-3 font-medium text-muted text-sm">
          {t.auth.invite.until(momentOf(invite.until, locale))}
        </p>
      )}
      {account ? (
        <Button disabled={busy} onClick={accept} size="lg">
          {t.auth.invite.accept}
        </Button>
      ) : (
        <>
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
