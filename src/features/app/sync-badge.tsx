"use client";

import { sync, useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

/** Online or not, and whether changes still wait – tap to sync now. */
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
      className="flex h-10 items-center gap-2 rounded-full border-2 border-ink bg-card px-3 font-bold text-xs shadow-sticker-sm transition active:shadow-none"
      onClick={() => void sync()}
      title={label}
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-2.5 w-2.5 rounded-full",
          !online
            ? "bg-muted"
            : pending || syncing
              ? "animate-pulse-dot bg-sun"
              : "bg-mint"
        )}
      />
      <span className="max-w-28 truncate sm:max-w-none">{label}</span>
    </button>
  );
};
