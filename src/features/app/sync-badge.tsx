"use client";

import { Check, Cross, Dot } from "@/components/doodles";
import { buttonClass } from "@/components/ui";
import { sync, useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

/**
 * Online or not, and whether changes still wait – tap to sync now. The sign
 * says it without color: a tick (all in sync), a pulsing dot (on its way),
 * a cross (offline).
 */
export const SyncBadge = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const { online, syncing, pending } = useBoop();
  const label = !online
    ? t.app.offline
    : syncing
      ? t.app.syncing
      : pending
        ? t.app.pending(pending)
        : t.app.synced;
  return (
    <button
      aria-live="polite"
      className={cn(
        buttonClass({ variant: "plain", size: "sm" }),
        "h-10 px-3 text-xs"
      )}
      onClick={() => void sync()}
      title={label}
      type="button"
    >
      {!online ? (
        <Cross className="h-3.5 w-3.5 shrink-0 text-muted" />
      ) : pending || syncing ? (
        <Dot className="h-3 w-3 shrink-0 animate-pulse-dot" />
      ) : (
        <Check className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="max-w-28 truncate sm:max-w-none">{label}</span>
    </button>
  );
};
