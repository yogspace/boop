"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LinkButton, Notice } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { verifyEmail } from "../client";
import { Frame } from "./frame";

/**
 * Where the mail after signing up leads: the address confirmed as the page
 * opens – then on to logging in.
 */
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
