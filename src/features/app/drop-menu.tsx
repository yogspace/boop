"use client";

import { AnimatePresence, m } from "motion/react";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { SPRING } from "@/components/motion";
import { cn } from "@/lib/cn";
import { useDismiss } from "./use-dismiss";

/** Whether the browser places things by anchors (`.drop-menu`, styles.css). */
const supportsAnchors = () =>
  typeof CSS !== "undefined" && CSS.supports("anchor-name: --x");

/** What the button that folds it out wears. */
export type DropButton = {
  ref: RefObject<HTMLButtonElement | null>;
  "aria-expanded": boolean;
  onClick: () => void;
  style?: CSSProperties;
};

/**
 * A button that folds out a list under it, to pick from – the stamps' order
 * (order-menu.tsx), the calendars (boop-app/calendar-menu.tsx). Pressed
 * again, a pick, a tap beside it or Escape folds it away – Escape first,
 * before a sheet it is in hears it and closes; the focus goes back to the
 * button.
 *
 * The list is a popover in the top layer, placed by anchor positioning
 * (`.drop-menu`, styles.css): nothing it hangs over – the page's edge, a
 * sheet's – cuts it off, and where there is no room it turns to the side
 * that has some. Without anchor positioning it hangs under the button.
 *
 * `button`: the button, given what it wears; `children`: the list's
 * content, given how to fold it away (`close`) after a pick.
 */
export const DropMenu = ({
  button,
  children,
  label,
  onShow,
  className,
  listClassName,
}: {
  button: (wears: DropButton) => ReactNode;
  children: (close: () => void) => ReactNode;
  /** What the list is, for a screen reader. */
  label?: string;
  /**
   * Told whether it is open – for whoever else listens for Escape ahead of
   * it (the day's page puts the stamp down with it), to let it be.
   */
  onShow?: (open: boolean) => void;
  className?: string;
  /** Its width, mostly. */
  listClassName?: string;
}) => {
  const [open, setOpen] = useState(false);
  const pressed = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const name = `--drop-${useId().replace(/[^\w-]/g, "")}`;
  // Asked once on the device – the server's page has no say in it.
  const [anchored, setAnchored] = useState(false);
  useEffect(() => setAnchored(supportsAnchors()), []);
  useDismiss(open, () => setOpen(false), pressed, box);
  useEffect(() => onShow?.(open), [open, onShow]);
  useLayoutEffect(() => {
    if (!open) return;
    const list = box.current;
    if (list?.popover) {
      try {
        list.showPopover();
      } catch {
        // Open already.
      }
      return;
    }
    // Hung under the button instead: unfolded at the bottom of a sheet (the
    // day's tray) it would hang out of sight below – what scrolls around it
    // brings it in, clear of the fading edge (`scroll-my-12`).
    list?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      if (box.current?.contains(document.activeElement))
        pressed.current?.focus();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  const close = () => {
    setOpen(false);
    pressed.current?.focus();
  };

  return (
    <div className={cn("relative", className)}>
      {button({
        ref: pressed,
        "aria-expanded": open,
        onClick: () => setOpen(!open),
        style: anchored ? ({ anchorName: name } as CSSProperties) : undefined,
      })}
      {/* Unfolds from the button, and folds back into it. */}
      <AnimatePresence>
        {open && (
          <m.div
            animate={{
              y: 0,
              scale: 1,
              opacity: 1,
              transition: { ...SPRING.soft, opacity: { duration: 0.15 } },
            }}
            aria-label={label}
            className={cn(
              "scribble flex flex-col gap-0.5 rounded-3xl p-2",
              anchored
                ? "drop-menu origin-top"
                : "absolute top-full right-0 z-40 mt-2 origin-top-right scroll-my-12",
              listClassName
            )}
            exit={{
              y: -6,
              scale: 0.96,
              opacity: 0,
              transition: { duration: 0.15, ease: "easeIn" },
            }}
            initial={{ y: -8, scale: 0.96, opacity: 0 }}
            ref={box}
            role={label ? "group" : undefined}
            {...(anchored && {
              popover: "manual",
              style: { positionAnchor: name } as CSSProperties,
            })}
          >
            {children(close)}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/** One of the list's choices – pressed when it is the one in use. */
export const DROP_ITEM =
  "scribble scribble-bare scribble-clear scribble-sm flex min-h-10 items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left font-bold text-sm hover:scribble-soft aria-pressed:[--scribble-fill:var(--cal-mark,var(--color-soft))]";
