"use client";

import { type ReactNode, useEffect } from "react";
import { cn } from "@/lib/cn";

/**
 * A layer over the app – rises from the bottom on phones, pops up in the
 * middle on wider screens. Closes with Escape or a tap beside it.
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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        aria-label="Close"
        className="absolute inset-0 animate-fade bg-ink/35 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />
      <div
        aria-modal="true"
        className={cn(
          "relative flex max-h-[94dvh] w-full max-w-lg animate-rise flex-col gap-4 overflow-y-auto rounded-t-[32px] border-2 border-ink bg-card p-5 shadow-sticker-lg sm:rounded-[32px] sm:p-6",
          className
        )}
        role="dialog"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-black text-2xl">{title}</h2>
          <button
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-card font-black shadow-sticker-sm transition hover:rotate-90 active:shadow-none"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};
