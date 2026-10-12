"use client";

import { Check, Cross, Dot } from "@/components/doodles";
import { ROUND_BUTTON } from "@/components/ui";
import { sync, useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

/**
 * Online or not, and whether changes still wait – tap to sync now. Only a
 * sign, round like the account's button: a tick (all in sync), a pulsing
 * dot with the number still waiting (on its way), a cross (offline). The
 * words are its label – read out, and shown when pointing at it.
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
      aria-label={label}
      className={cn(ROUND_BUTTON, "relative", !online && "text-muted")}
      onClick={() => void sync()}
      title={label}
      type="button"
    >
      {!online ? (
        <Cross className="h-4 w-4" />
      ) : pending || syncing ? (
        <Dot className="h-3 w-3 animate-pulse-dot" />
      ) : (
        <Check className="h-4.5 w-4.5" />
      )}
      {online && pending > 0 && (
        // How many still wait – small, on its edge.
        <span className="absolute -top-1.5 -right-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-ink px-1 font-black text-[10px] text-white leading-none">
          {pending > 99 ? "99+" : pending}
        </span>
      )}
      <span aria-live="polite" className="sr-only">
        {label}
      </span>
    </button>
  );
};
