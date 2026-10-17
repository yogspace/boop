"use client";

import { AnimatePresence, m } from "motion/react";
import { useRef } from "react";
import { SPRING } from "@/components/motion";
import { Button, buttonClass, Logo, ROUND_BUTTON } from "@/components/ui";
import { useBoop } from "@/features/offline/store";
import { Link } from "@/features/transitions/link";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { SyncMark } from "../sync-badge";
import { useDismiss } from "../use-dismiss";
import { ahead } from "./later";
import { AccountSheet, ConfirmSheet } from "./lazy-sheets";

/** What the account's menu opens – fetched as one comes to its button. */
const accountAhead = ahead(AccountSheet, ConfirmSheet);

/**
 * The app's bar – the same as the public pages', so nothing jumps when
 * changing between them: the logo, the way home; and the account's round
 * button, its initial in it, which unfolds a little menu – the account's
 * sheet, the CMS for an admin, logging out.
 *
 * `menu`: whether the menu is open – the app's to know, as it lies over the
 * today view (its keys rest meanwhile).
 */
export const AppHeader = ({
  locale,
  menu,
  onMenu,
  onAccount,
  onLogout,
}: {
  locale: Locale;
  menu: boolean;
  onMenu: (open: boolean) => void;
  onAccount: () => void;
  onLogout: () => void;
}) => {
  const t = dictionaryOf(locale);
  const { me, invitations, online } = useBoop();
  const firstName = me?.name.split(" ")[0] ?? "";
  // The menu closes with a press elsewhere, or Escape.
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuBox = useRef<HTMLDivElement>(null);
  useDismiss(menu, () => onMenu(false), menuButton, menuBox);
  return (
    <header className="flex items-center justify-between gap-4 py-5">
      <Link aria-label={t.nav.home} href={`/${locale}`}>
        <Logo className="text-[32px]" />
      </Link>
      <div className="relative flex items-center gap-2">
        <button
          aria-expanded={menu}
          aria-label={t.app.account}
          className={cn(ROUND_BUTTON, "relative aria-expanded:scribble-ink")}
          onClick={() => onMenu(!menu)}
          onFocus={accountAhead}
          onPointerEnter={accountAhead}
          ref={menuButton}
          type="button"
        >
          {firstName.slice(0, 1).toUpperCase() || "?"}
          {/* Invitations, changes waiting, offline – the sheet says more. */}
          <SyncMark locale={locale} />
        </button>
        {/* Unfolds from the button, and folds back into it. */}
        <AnimatePresence>
          {menu && (
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
              ref={menuBox}
            >
              <div>
                <p className="font-black">{me?.name}</p>
                <p className="truncate text-muted text-sm">{me?.email}</p>
              </div>
              <Button
                onClick={() => {
                  onMenu(false);
                  onAccount();
                }}
                size="sm"
                variant="plain"
              >
                {t.app.accountSheet.title}
                {/* The invitations wait in there. */}
                {invitations.length > 0 && (
                  <>
                    <span
                      aria-hidden="true"
                      className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-ink px-1 font-black text-[10px] text-white leading-none"
                    >
                      {invitations.length}
                    </span>
                    <span className="sr-only">
                      {t.app.invitations.count(invitations.length)}
                    </span>
                  </>
                )}
              </Button>
              {/* Where an admin ticked the account's box in the CMS, the
                  way there – a shortcut and no more: the CMS asks for its
                  own login. In a tab of its own: the app stays open, with
                  what waits in it. */}
              {me?.admin && (
                <a
                  className={buttonClass({ variant: "plain", size: "sm" })}
                  href="/admin"
                  onClick={() => onMenu(false)}
                  rel="noopener"
                  target="_blank"
                >
                  {t.app.accountSheet.cms}
                </a>
              )}
              <Button
                disabled={!online}
                onClick={onLogout}
                size="sm"
                variant="plain"
              >
                {t.app.logout}
              </Button>
              {!online && (
                <p className="text-muted text-xs">{t.app.logoutOffline}</p>
              )}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
};
