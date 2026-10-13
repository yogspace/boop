"use client";

import { useSearchParams } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Bang, Star, Ticks } from "@/components/doodles";
import { Button, Checkbox, Field, LinkButton, Notice } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import { legalPath } from "@/features/legal/links";
import { getMeta, write } from "@/features/offline/db";
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
  type Me,
  register,
  resetPassword,
  verifyEmail,
} from "./client";
import { checkPassword, type Owner, type Weakness } from "./password-strength";

/**
 * The account pages' forms: log in, sign up, forgot password, new password,
 * confirm address, confirm a new address, invitation. Each talks to the
 * server through ./client.ts.
 */

/**
 * An invitation opened before logging in – taken up after the login:
 * following its link was the yes.
 */
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
      // No storage – an invitation to the account's own address still
      // waits in the app.
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

/** How long typing pauses before a new password is looked at. */
const SETTLE_MS = 800;

/** Why a password is easy to guess – nothing to say while there is none. */
const warningFor = (password: string, owner: Owner): Weakness | null => {
  if (!password) return null;
  const check = checkPassword(password, owner);
  return check.ok ? null : check.reason;
};

/**
 * The field for a new password, and under it a word when the password is
 * easy to guess (password-strength.ts): why, and what does better. A
 * warning, no rule – the form sends it all the same. Looked at once typing
 * pauses or the field is left, not at every key, and on this device alone.
 * `name` and `email`: whose it is, as far as the form knows.
 */
const NewPassword = ({
  locale,
  label,
  value,
  onChange,
  name,
  email,
}: {
  locale: Locale;
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  email?: string;
}) => {
  const t = dictionaryOf(locale);
  const text = t.auth.weakPassword;
  const id = useId();
  const [warning, setWarning] = useState<Weakness | null>(null);
  useEffect(() => {
    const timer = setTimeout(
      () => setWarning(warningFor(value, { name, email })),
      SETTLE_MS
    );
    return () => clearTimeout(timer);
  }, [value, name, email]);
  return (
    <div>
      <Field
        aria-describedby={id}
        autoComplete="new-password"
        hint={t.auth.passwordHint}
        label={label}
        minLength={8}
        onBlur={() => setWarning(warningFor(value, { name, email }))}
        onChange={(event) => onChange(event.target.value)}
        required
        type="password"
        value={value}
      />
      {/* Always there, empty or not – so a screen reader hears what comes. */}
      <div aria-live="polite" id={id}>
        {warning && (
          <p
            className="mt-2.5 flex animate-fade items-start gap-2 font-medium text-sm"
            key={warning}
          >
            <Bang className="mt-px h-4 w-4 shrink-0" />
            <span>
              {text[warning]} {text.tip}
            </span>
          </p>
        )}
      </div>
    </div>
  );
};

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
 * otherwise after logging in or signing up (`afterLogin`).
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
        <p className="-mt-3 font-medium text-muted text-sm">
          {t.auth.working}
        </p>
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
