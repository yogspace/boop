"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { SPRING } from "@/components/motion";
import { Button, LinkButton, ROUND_BUTTON } from "@/components/ui";
import { useDismiss } from "@/features/app/use-dismiss";
import { getAll, getMeta } from "@/features/offline/db";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import type { Me } from "./client";
import { ONLY_SIGNED_IN } from "./signed-in";

/**
 * The account's round button on the public pages – the app's, in their bar:
 * shown only to whoever is logged in on this device (`ONLY_SIGNED_IN`, set
 * before the first paint), its letter from the device's copy. It unfolds
 * the account's menu: who it is, the way into the app, logging out.
 *
 * Logging out here clears the device's copy like in the app – unless
 * changes still wait to be sent: those would go with it, so that is left to
 * the app, which syncs them first (or asks).
 */
export const AccountButton = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const [me, setMe] = useState<Me | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), button, menu);

  useEffect(() => {
    if (!document.documentElement.hasAttribute("data-in")) return;
    void getMeta<Me>("me")
      .then((found) => setMe(found ?? null))
      .catch(() => undefined);
  }, []);

  const toggle = async () => {
    if (!open) {
      // Fresh from the device's copy – a new name or address may have come
      // since the page was opened.
      const [outbox, found] = await Promise.all([
        getAll("outbox").catch(() => []),
        getMeta<Me>("me").catch(() => undefined),
      ]);
      setWaiting(outbox.length);
      if (found) setMe(found);
    }
    setOpen(!open);
  };

  const logout = async () => {
    setBusy(true);
    const { logout: leave } = await import("@/features/offline/store");
    const ok = await leave();
    setBusy(false);
    if (!ok) return;
    setOpen(false);
    // The bar shows the ways in again (signed-in.ts).
    document.documentElement.removeAttribute("data-in");
  };

  return (
    <div className={cn(ONLY_SIGNED_IN, "relative")}>
      <button
        aria-expanded={open}
        aria-label={t.app.account}
        className={cn(ROUND_BUTTON, "aria-expanded:scribble-ink")}
        onClick={() => void toggle()}
        ref={button}
        type="button"
      >
        {me?.name.slice(0, 1).toUpperCase()}
      </button>
      {/* Unfolds from the button, and folds back into it – as in the app. */}
      <AnimatePresence>
        {open && (
          <m.div
            animate={{
              y: 0,
              scale: 1,
              opacity: 1,
              transition: { ...SPRING.soft, opacity: { duration: 0.15 } },
            }}
            className="scribble absolute top-13 right-0 z-40 flex w-60 origin-top-right flex-col gap-3 rounded-3xl p-4"
            exit={{
              y: -6,
              scale: 0.96,
              opacity: 0,
              transition: { duration: 0.15, ease: "easeIn" },
            }}
            initial={{ y: -8, scale: 0.96, opacity: 0 }}
            ref={menu}
          >
            {me && (
              <div>
                <p className="font-black">{me.name}</p>
                <p className="truncate text-muted text-sm">{me.email}</p>
              </div>
            )}
            <LinkButton href={`/${locale}/app`} size="sm">
              {t.nav.openApp}
            </LinkButton>
            {waiting > 0 ? (
              <p className="text-muted text-xs">{t.nav.logoutInApp}</p>
            ) : (
              <Button
                disabled={busy}
                onClick={() => void logout()}
                size="sm"
                variant="plain"
              >
                {t.app.logout}
              </Button>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
};
