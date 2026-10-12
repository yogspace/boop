"use client";

import { useId, useState } from "react";
import { Check, Cross, Dot } from "@/components/doodles";
import { Button, ROUND_BUTTON } from "@/components/ui";
import { sync, useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

/**
 * Online or not, and whether changes still wait. Only a sign, round like the
 * account's button: a tick (all in sync), a pulsing dot with the number
 * still waiting (on its way), a cross (offline). The words are its label,
 * read out.
 *
 * Tapping it opens a note hung from it (a popover – `sync-overlay`,
 * styles.css): the state, what it means, and a button to sync now. It
 * follows the state while open; a tap elsewhere or Escape closes it.
 * Pointing alone opens nothing – there is no pointing on a phone.
 */
export const SyncBadge = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const { online, syncing, pending } = useBoop();
  const id = useId();
  const [open, setOpen] = useState(false);
  const state = !online
    ? "offline"
    : syncing
      ? "syncing"
      : pending
        ? "pending"
        : "synced";
  const label = state === "pending" ? t.app.pending(pending) : t.app[state];
  return (
    <>
      <button
        aria-expanded={open}
        aria-label={label}
        className={cn(
          ROUND_BUTTON,
          "relative [anchor-name:--sync-badge] aria-expanded:scribble-ink",
          !online && "text-muted aria-expanded:text-card"
        )}
        popoverTarget={id}
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
      <div
        className="sync-overlay"
        id={id}
        onToggle={(event) => setOpen(event.newState === "open")}
        popover="auto"
      >
        <div className="scribble flex flex-col gap-3 rounded-3xl p-4">
          <p className="font-black leading-snug">{label}</p>
          <p className="text-muted text-sm">
            {t.app.sync[state]} {t.app.sync.how}
          </p>
          <Button
            className="self-start"
            disabled={!online}
            onClick={() => void sync()}
            size="sm"
            variant="plain"
          >
            {t.app.sync.now}
          </Button>
        </div>
      </div>
    </>
  );
};
