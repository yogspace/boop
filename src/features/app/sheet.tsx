"use client";

import { m, useIsPresent } from "motion/react";
import { type ReactNode, useEffect, useSyncExternalStore } from "react";
import { Cross } from "@/components/doodles";
import { SPRING } from "@/components/motion";
import { ROUND_BUTTON } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Tailwind's `sm` – where the sheet stops being a phone's bottom sheet. */
const WIDE = "(min-width: 40rem)";
const watchWide = (change: () => void) => {
  const query = matchMedia(WIDE);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
const useWide = () =>
  useSyncExternalStore(
    watchWide,
    () => matchMedia(WIDE).matches,
    () => false
  );

/**
 * How the sheet comes and goes. On a phone it slides up from below the
 * screen's edge and back down; wider, it lies down in the middle, a little
 * larger than it ends up, and steps back again. Going is quicker than coming,
 * and falls rather than springs.
 */
const PHONE = {
  initial: { y: "100%", opacity: 0 },
  animate: {
    y: 0,
    opacity: 1,
    transition: { ...SPRING.soft, opacity: { duration: 0.15 } },
  },
  exit: {
    y: "100%",
    opacity: 0,
    transition: {
      duration: 0.24,
      ease: [0.4, 0, 0.9, 0.5],
      opacity: { duration: 0.12, delay: 0.12 },
    },
  },
} as const;
const DESKTOP = {
  initial: { y: 16, scale: 0.96, opacity: 0 },
  animate: {
    y: 0,
    scale: 1,
    opacity: 1,
    transition: { ...SPRING.soft, opacity: { duration: 0.2 } },
  },
  exit: {
    y: 8,
    scale: 0.96,
    opacity: 0,
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
  },
} as const;

/**
 * A layer over the app – a sheet of paper laid on the page: it rises from
 * the bottom on phones, pops up in the middle on wider screens. Closes with
 * Escape or a tap beside it.
 *
 * Its way out needs an AnimatePresence round where it is shown
 * (`<AnimatePresence>{open && <SomeSheet key="…" … />}</AnimatePresence>`):
 * the parent drops it at once, however it was closed – the X, beside it,
 * Escape, or the sheet itself after saving – and it stays just long enough
 * to go, deaf to any further tap or key.
 *
 * Taller than the screen, the whole sheet scrolls – the layer it lies on is
 * the scroller, like a page: wherever the finger or the wheel is, it moves
 * (a box scrolling inside the sheet left too little room to grab in
 * Safari). Nothing clips the scribbled frame; it floats a little off the
 * screen's edges on phones, too.
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
  const leaving = !useIsPresent();
  const moves = useWide() ? DESKTOP : PHONE;

  // The page behind stays where it is – until the sheet is gone.
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    if (leaving) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leaving, onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain">
      {/* The page fades back like paper under tracing paper – no dark veil.
          Going, it still catches taps: a second one lands on nothing. */}
      <m.button
        animate={{ opacity: 1, transition: { duration: 0.24 } }}
        aria-label="Close"
        className="fixed inset-0 bg-bg/80 backdrop-blur-[2px]"
        exit={{ opacity: 0, transition: { duration: 0.2, ease: "easeIn" } }}
        initial={{ opacity: 0 }}
        onClick={leaving ? undefined : onClose}
        tabIndex={leaving ? -1 : undefined}
        type="button"
      />
      <div className="pointer-events-none flex min-h-full items-end justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
        <m.div
          {...moves}
          aria-modal="true"
          className={cn(
            "scribble pointer-events-auto relative flex w-full max-w-lg flex-col rounded-[28px] sm:rounded-[32px]",
            className
          )}
          inert={leaving}
          role="dialog"
        >
          <div className="my-2 flex flex-col gap-4 px-5 py-3 sm:px-6 sm:py-4">
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
        </m.div>
      </div>
    </div>
  );
};
