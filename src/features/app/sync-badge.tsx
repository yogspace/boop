"use client";

import { Check, Cross, Dot } from "@/components/doodles";
import { Button } from "@/components/ui";
import { sync, useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";

/**
 * Online or not, and whether changes still wait – in the account's menu
 * (boop-app.tsx), not in the bar: there it was louder than it deserves. The
 * bar keeps only a sign on the account's button when there is something to
 * say (`SyncMark`); the menu says it in words, with a button to sync now
 * (`SyncStatus`).
 */

const useSyncState = (locale: Locale) => {
  const t = dictionaryOf(locale);
  const { online, syncing, pending } = useBoop();
  const state: "offline" | "syncing" | "pending" | "synced" = !online
    ? "offline"
    : syncing
      ? "syncing"
      : pending
        ? "pending"
        : "synced";
  const label = state === "pending" ? t.app.pending(pending) : t.app[state];
  return { t, online, pending, state, label };
};

/**
 * On the account's button, at its edge: how many changes wait (a number),
 * or a cross while offline – nothing while all is in sync. The words are
 * read out as they change.
 */
export const SyncMark = ({ locale }: { locale: Locale }) => {
  const { online, pending, state, label } = useSyncState(locale);
  return (
    <>
      {!online ? (
        <span className="absolute -top-1.5 -right-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-ink text-white ring-2 ring-card">
          <Cross className="h-2.5 w-2.5" />
        </span>
      ) : (
        pending > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-ink px-1 font-black text-[10px] text-white leading-none ring-2 ring-card">
            {pending > 99 ? "99+" : pending}
          </span>
        )
      )}
      <span aria-live="polite" className="sr-only">
        {state === "synced" ? "" : label}
      </span>
    </>
  );
};

/** In the account's menu: the state, what it means, and sync now. */
export const SyncStatus = ({ locale }: { locale: Locale }) => {
  const { t, online, pending, state, label } = useSyncState(locale);
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 font-bold text-sm">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          {!online ? (
            <Cross className="h-4 w-4" />
          ) : pending || state === "syncing" ? (
            <Dot className="h-3 w-3 animate-pulse-dot" />
          ) : (
            <Check className="h-4.5 w-4.5" />
          )}
        </span>
        {state === "offline" ? t.app.sync.offlineTitle : label}
      </p>
      <p className="text-muted text-xs">{t.app.sync[state]}</p>
      {/* Quieter than the account's own buttons below it. */}
      <Button
        className="-ml-2 self-start"
        disabled={!online}
        onClick={() => void sync()}
        size="sm"
        variant="ghost"
      >
        {t.app.sync.now}
      </Button>
    </div>
  );
};
