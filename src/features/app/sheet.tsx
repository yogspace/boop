"use client";

import { type ReactNode, useEffect } from "react";
import { Cross } from "@/components/doodles";
import { ROUND_BUTTON } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * A layer over the app – a sheet of paper laid on the page: it rises from
 * the bottom on phones, pops up in the middle on wider screens. Closes with
 * Escape or a tap beside it.
 *
 * The scribbled frame is the sheet's; what scrolls is the box inside it – so
 * the frame stays put, and nothing of it is cut off (it floats a little off
 * the screen's edges on phones, too).
 */
export const Sheet = ({
  title,
  onClose,
  children,
  className,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // The page behind stays where it is.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
      {/* The page fades back like paper under tracing paper – no dark veil. */}
      <button
        aria-label="Close"
        className="absolute inset-0 animate-fade bg-bg/80 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />
      <div
        aria-modal="true"
        className={cn(
          "scribble relative flex max-h-[94dvh] w-full max-w-lg animate-rise flex-col rounded-[28px] sm:rounded-[32px]",
          className
        )}
        role="dialog"
      >
        {/* Kept a little inside the frame, so nothing scrolls across its line. */}
        <div className="my-2 flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-black text-2xl">{title}</h2>
            <button
              aria-label="Close"
              className={ROUND_BUTTON}
              onClick={onClose}
              type="button"
            >
              <Cross className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};
