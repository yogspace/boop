"use client";

import { sync, useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

/** Online or not, and whether changes are still waiting – tap to sync now. */
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
      className="flex items-center gap-2 rounded-full border-2 border-ink bg-card px-3 py-1 text-xs"
      onClick={() => void sync()}
      title={label}
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-2.5 w-2.5 rounded-full",
          !online ? "bg-muted" : pending || syncing ? "bg-sun" : "bg-mint"
        )}
      />
      <span className="max-w-40 truncate sm:max-w-none">{label}</span>
    </button>
  );
};
