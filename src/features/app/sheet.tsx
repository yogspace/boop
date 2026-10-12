"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Cross } from "@/components/doodles";
import { ROUND_BUTTON } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Whether the sheet in a SheetSlot is on its way out – and how it tells the
 * slot, once its animation is over, that it is gone.
 */
const Leaving = createContext({ leaving: false, gone: () => {} });

/**
 * Where a sheet appears: `{open && <SomeSheet … />}` goes inside. However it
 * is closed – the X, a tap beside it, Escape, or the sheet itself after
 * saving – the parent drops it at once, as ever; the slot keeps the last one
 * a moment longer, still and deaf to taps, until it has gone (Sheet below).
 * So the sheets know nothing of it: they call onClose like before.
 *
 * Opened again before it is gone, the new one simply takes its place.
 */
export const SheetSlot = ({ children }: { children: ReactNode }) => {
  // The sheet as last shown – what stays on the page while it goes.
  const [last, setLast] = useState(children);
  if (children && children !== last) setLast(children);
  const leaving = !children && Boolean(last);

  const value = useMemo(
    () => ({ leaving, gone: () => setLast(null) }),
    [leaving]
  );
  // Should its animation never end (a page in the background, say), it goes
  // anyway – a sheet that stays would cover the app.
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(value.gone, 1000);
    return () => clearTimeout(timer);
  }, [leaving, value]);

  return <Leaving.Provider value={value}>{children || last}</Leaving.Provider>;
};

/**
 * A layer over the app – a sheet of paper laid on the page: it rises from
 * the bottom on phones, pops up in the middle on wider screens. Closes with
 * Escape or a tap beside it – and, in a SheetSlot, goes the way it came:
 * sliding down on phones, stepping back on wider screens, while the page
 * behind comes clear again.
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
  const { leaving, gone } = useContext(Leaving);

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
      <button
        aria-label="Close"
        className={cn(
          "fixed inset-0 bg-bg/80 backdrop-blur-[2px]",
          leaving ? "animate-fade-out" : "animate-fade"
        )}
        onClick={leaving ? undefined : onClose}
        tabIndex={leaving ? -1 : undefined}
        type="button"
      />
      <div className="pointer-events-none flex min-h-full items-end justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
        <div
          aria-modal="true"
          className={cn(
            "scribble pointer-events-auto relative flex w-full max-w-lg flex-col rounded-[28px] sm:rounded-[32px]",
            leaving ? "animate-sink sm:animate-recede" : "animate-rise",
            className
          )}
          inert={leaving}
          onAnimationEnd={(event) => {
            if (leaving && event.target === event.currentTarget) gone();
          }}
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
        </div>
      </div>
    </div>
  );
};
