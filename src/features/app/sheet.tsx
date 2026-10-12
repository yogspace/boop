"use client";

import { m, useIsPresent } from "motion/react";
import { type ReactNode, useEffect, useRef, useSyncExternalStore } from "react";
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
 * How far (px) what scrolls fades out at an edge it goes on beyond – no
 * scrollbar, the fade says there is more. It grows with what is hidden
 * there, so it comes and goes smoothly as one scrolls.
 */
const FADE = 32;

/** The fading edges of a scroller – as `--fade-top` / `--fade-bottom`. */
const useFadingEdges = () => {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const fade = () => {
      const below = box.scrollHeight - box.clientHeight - box.scrollTop;
      box.style.setProperty("--fade-top", `${Math.min(FADE, box.scrollTop)}px`);
      box.style.setProperty(
        "--fade-bottom",
        `${Math.min(FADE, Math.max(0, below))}px`
      );
    };
    fade();
    box.addEventListener("scroll", fade, { passive: true });
    // What is inside may grow or shrink (a form opening, a picture loading).
    const sizes = new ResizeObserver(fade);
    sizes.observe(box);
    for (const child of box.children) sizes.observe(child);
    return () => {
      box.removeEventListener("scroll", fade);
      sizes.disconnect();
    };
  }, []);
  return scroller;
};

/** Scrolls without a bar, fading at the edges (`useFadingEdges`). */
const FADING =
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_bottom,transparent,#000_var(--fade-top,0px),#000_calc(100%_-_var(--fade-bottom,0px)),transparent)]";

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
 * Never taller than the screen: what doesn't fit scrolls inside the sheet,
 * under its title and its X, which stay – and nothing outside it moves, not
 * the layer it lies on, not the page behind. The scroller keeps room at its
 * sides, so what reaches a little out (a focus ring, a tilted stamp, a row
 * that bleeds to the edge with `-m-4`) isn't cut. Nothing clips the
 * scribbled frame; it floats a little off the screen's edges on phones, too.
 * No scrollbar: the content fades out at an edge where there is more.
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
  const scroller = useFadingEdges();

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
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* The page fades back like paper under tracing paper – no dark veil.
          Going, it still catches taps: a second one lands on nothing. */}
      <m.button
        animate={{ opacity: 1, transition: { duration: 0.24 } }}
        aria-label="Close"
        className="fixed inset-0 touch-none bg-bg/80 backdrop-blur-[2px]"
        exit={{ opacity: 0, transition: { duration: 0.2, ease: "easeIn" } }}
        initial={{ opacity: 0 }}
        onClick={leaving ? undefined : onClose}
        tabIndex={leaving ? -1 : undefined}
        type="button"
      />
      <div className="pointer-events-none flex h-full items-end justify-center p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
        <m.div
          {...moves}
          aria-modal="true"
          className={cn(
            "scribble pointer-events-auto relative flex max-h-full w-full max-w-lg flex-col rounded-[28px] sm:rounded-[32px]",
            className
          )}
          inert={leaving}
          role="dialog"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-1 sm:px-6 sm:pt-6">
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
          <div
            className={cn(
              "flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pt-3 pb-5 sm:px-6 sm:pb-6",
              FADING
            )}
            ref={scroller}
          >
            {children}
          </div>
        </m.div>
      </div>
    </div>
  );
};
