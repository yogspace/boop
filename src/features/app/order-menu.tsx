"use client";

import { AnimatePresence, m } from "motion/react";
import {
  type CSSProperties,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Check } from "@/components/doodles";
import { SPRING } from "@/components/motion";
import { buttonClass } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { SHELF_ORDERS, type ShelfOrder } from "./shelf";
import { useDismiss } from "./use-dismiss";

/** Whether the browser places things by anchors (`.order-menu`, styles.css). */
const supportsAnchors = () =>
  typeof CSS !== "undefined" && CSS.supports("anchor-name: --x");

/**
 * The stamps' order (shelf.ts), as a little button with the one in use –
 * pressed, the four fold out under it to pick from. On the shelf
 * (stamp-shelf.tsx) and over a day's tray (day-page/tray.tsx), one choice
 * for both. Escape folds them away first – before a sheet the tray is in
 * hears it and closes.
 *
 * The list is a popover in the top layer, placed by anchor positioning
 * (`.order-menu`, styles.css): nothing it hangs over – the page's edge, a
 * sheet's – cuts it off, and where there is no room it turns to the side
 * that has some. Without anchor positioning it hangs under the button.
 */
export const OrderMenu = ({
  order,
  locale,
  onPick,
  onShow,
  className,
}: {
  order: ShelfOrder;
  locale: Locale;
  onPick: (order: ShelfOrder) => void;
  /**
   * Told whether it is open – for whoever else listens for Escape ahead of
   * it (the day's page puts the stamp down with it), to let it be.
   */
  onShow?: (open: boolean) => void;
  className?: string;
}) => {
  const t = dictionaryOf(locale);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const name = `--order-${useId().replace(/[^\w-]/g, "")}`;
  // Asked once on the device – the server's page has no say in it.
  const [anchored, setAnchored] = useState(false);
  useEffect(() => setAnchored(supportsAnchors()), []);
  useDismiss(open, () => setOpen(false), button, box);
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
        button.current?.focus();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    <div className={cn("relative shrink-0", className)}>
      <button
        aria-expanded={open}
        className={cn(
          buttonClass({ variant: "plain", size: "sm" }),
          "scribble-thin min-h-9 gap-1.5 px-3 py-1 text-[13px] aria-expanded:scribble-soft"
        )}
        onClick={() => setOpen(!open)}
        ref={button}
        style={anchored ? ({ anchorName: name } as CSSProperties) : undefined}
        type="button"
      >
        <SortSign className="h-4 w-4 shrink-0" />
        <span className="sr-only">{t.app.shelf.order}: </span>
        {t.app.shelf[order]}
      </button>
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
            className={cn(
              "scribble flex w-52 flex-col gap-0.5 rounded-3xl p-2",
              anchored
                ? "order-menu origin-top"
                : "absolute top-full right-0 z-40 mt-2 origin-top-right scroll-my-12"
            )}
            exit={{
              y: -6,
              scale: 0.96,
              opacity: 0,
              transition: { duration: 0.15, ease: "easeIn" },
            }}
            initial={{ y: -8, scale: 0.96, opacity: 0 }}
            ref={box}
            {...(anchored && {
              popover: "manual",
              style: { positionAnchor: name } as CSSProperties,
            })}
          >
            <p className="px-3 pt-1 pb-1.5 font-bold text-muted text-xs">
              {t.app.shelf.order}
            </p>
            {SHELF_ORDERS.map((o) => (
              <button
                aria-pressed={order === o}
                className="scribble scribble-bare scribble-clear scribble-sm flex min-h-10 items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left font-bold text-sm hover:scribble-soft aria-pressed:[--scribble-fill:var(--cal-mark,var(--color-soft))]"
                key={o}
                onClick={() => {
                  onPick(o);
                  setOpen(false);
                  button.current?.focus();
                }}
                type="button"
              >
                {t.app.shelf[o]}
                {order === o && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/** Three lines, shorter and shorter – put in order. */
const SortSign = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeWidth="2.6"
    viewBox="0 0 24 24"
  >
    <path d="M4 6.5h16" />
    <path d="M4 12h11" />
    <path d="M4 17.5h6" />
  </svg>
);
