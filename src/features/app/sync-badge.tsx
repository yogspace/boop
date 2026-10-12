"use client";

import { m } from "motion/react";
import { useId, useRef, useState } from "react";
import { Check, Cross, Dot } from "@/components/doodles";
import { SPRING } from "@/components/motion";
import { Button, ROUND_BUTTON } from "@/components/ui";
import { sync, useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { useDismiss } from "./use-dismiss";

/**
 * Online or not, and whether changes still wait. Only a sign, beside the
 * account's button but quieter – no frame of its own: a grey tick (all in
 * sync, nothing to see here), a pulsing dot with the number still waiting
 * (on its way), a cross (offline). The words are its label, read out.
 *
 * Tapping it opens a note hung from it (a popover – `sync-overlay`,
 * styles.css): the state, what it means, and a button to sync now. It
 * follows the state while open; a tap elsewhere or Escape closes it.
 * Pointing alone opens nothing – there is no pointing on a phone.
 *
 * The popover is a manual one: the browser's own light dismiss hides it at
 * once, with no time to go. So the note says when it's done – it drops in
 * on a spring, lifts away, and only then leaves the top layer.
 */
export const SyncBadge = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const { online, syncing, pending } = useBoop();
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const note = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const state = !online
    ? "offline"
    : syncing
      ? "syncing"
      : pending
        ? "pending"
        : "synced";
  const label = state === "pending" ? t.app.pending(pending) : t.app[state];

  const toggle = () => {
    if (!open) note.current?.showPopover();
    setOpen(!open);
  };

  // Our own light dismiss – a press elsewhere, or Escape.
  useDismiss(open, () => setOpen(false), button, note);

  return (
    <>
      <button
        aria-controls={id}
        aria-expanded={open}
        aria-label={label}
        className={cn(
          ROUND_BUTTON,
          // Quiet in the bar: no frame, a soft blob when pointed at – and
          // grey while there is nothing to say. It speaks up only when
          // changes wait or the connection is gone.
          "relative scribble-bare scribble-clear [anchor-name:--sync-badge] hover:scribble-soft hover:translate-y-0 hover:rotate-0 aria-expanded:scribble-ink",
          state === "synced" && "text-muted aria-expanded:text-card"
        )}
        onClick={toggle}
        ref={button}
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
          // How many still wait – small, on its edge; a paper ring keeps it
          // apart from the badge when that is filled.
          <span className="absolute -top-1.5 -right-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-ink px-1 font-black text-[10px] text-white leading-none ring-2 ring-card">
            {pending > 99 ? "99+" : pending}
          </span>
        )}
        <span aria-live="polite" className="sr-only">
          {label}
        </span>
      </button>
      <div className="sync-overlay" id={id} popover="manual" ref={note}>
        <m.div
          animate={open ? { opacity: 1, y: 0 } : { opacity: 0, y: -6 }}
          className="scribble flex flex-col gap-3 rounded-3xl p-4"
          initial={false}
          onAnimationComplete={() => {
            if (!open && note.current?.matches(":popover-open")) {
              note.current.hidePopover();
            }
          }}
          transition={open ? SPRING.soft : { duration: 0.14, ease: "easeIn" }}
        >
          <p className="font-black leading-snug">
            {state === "offline" ? t.app.sync.offlineTitle : label}
          </p>
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
        </m.div>
      </div>
    </>
  );
};
