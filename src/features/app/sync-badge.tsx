"use client";

import { useEffect, useState } from "react";
import { Check, Cross, Dot } from "@/components/doodles";
import { Button } from "@/components/ui";
import { sync, useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";

/**
 * Online or not, and whether changes still wait – in the account's sheet
 * (account-sheet.tsx), not in the bar: there it was louder than it deserves.
 * The bar keeps only a sign on the account's button when there is something
 * to say (`SyncMark`); the sheet says it in words, with a button to sync now
 * (`SyncStatus`). The sign shares the button with the invitations waiting.
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

/** A change on its way for a moment is no news – only one that stays. */
const STAYS_MS = 5000;

/**
 * On the account's button, at its edges: how many invitations wait (a
 * number, on top) – and below, a cross while offline, or a dot when changes
 * have waited a while (each change waits a moment before it goes: a sign
 * for that would blink at every print). Nothing while all is well. The
 * words are read out as they change.
 */
export const SyncMark = ({ locale }: { locale: Locale }) => {
  const { t, online, pending, label } = useSyncState(locale);
  const { invitations } = useBoop();
  const waiting = online && pending > 0;
  const [stays, setStays] = useState(false);
  useEffect(() => {
    if (!waiting) {
      setStays(false);
      return;
    }
    const timer = setTimeout(() => setStays(true), STAYS_MS);
    return () => clearTimeout(timer);
  }, [waiting]);
  const invited = invitations.length;
  const said = [
    invited > 0 && t.app.invitations.count(invited),
    (!online || stays) && label,
  ].filter(Boolean);
  return (
    <>
      {invited > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-ink px-1 font-black text-[10px] text-white leading-none ring-2 ring-card">
          {invited > 9 ? "9+" : invited}
        </span>
      )}
      {!online ? (
        <span className="absolute -right-1.5 -bottom-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-ink text-white ring-2 ring-card">
          <Cross className="h-2.5 w-2.5" />
        </span>
      ) : (
        stays && (
          <span className="absolute -right-1 -bottom-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-card">
            <Dot className="h-2.5 w-2.5 animate-pulse-dot" />
          </span>
        )
      )}
      <span aria-live="polite" className="sr-only">
        {said.join(", ")}
      </span>
    </>
  );
};

/**
 * In the account's sheet: the state and a button to sync now in one row,
 * under them what it means and how syncing goes.
 */
export const SyncStatus = ({ locale }: { locale: Locale }) => {
  const { t, online, pending, state, label } = useSyncState(locale);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex items-center gap-2 font-bold">
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
        <Button
          disabled={!online}
          onClick={() => void sync()}
          size="sm"
          variant="plain"
        >
          {t.app.sync.now}
        </Button>
      </div>
      <p className="font-medium text-muted text-sm">
        {t.app.sync[state]} {t.app.sync.how}
      </p>
    </div>
  );
};
