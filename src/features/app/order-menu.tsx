"use client";

import { Check } from "@/components/doodles";
import { buttonClass } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { DROP_ITEM, DropMenu } from "./drop-menu";
import { SHELF_ORDERS, type ShelfOrder } from "./shelf";

/**
 * The stamps' order (shelf.ts), as a little button with the one in use –
 * pressed, the four fold out under it to pick from (drop-menu.tsx). On the
 * shelf (stamp-shelf.tsx) and over a day's tray (day-page/tray.tsx), one
 * choice for both.
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
  /** Told whether it is open (drop-menu.tsx). */
  onShow?: (open: boolean) => void;
  className?: string;
}) => {
  const t = dictionaryOf(locale);
  return (
    <DropMenu
      button={(wears) => (
        <button
          {...wears}
          className={cn(
            buttonClass({ variant: "plain", size: "sm" }),
            "scribble-thin min-h-9 gap-1.5 px-3 py-1 text-[13px] aria-expanded:scribble-soft"
          )}
          type="button"
        >
          <SortSign className="h-4 w-4 shrink-0" />
          <span className="sr-only">{t.app.shelf.order}: </span>
          {t.app.shelf[order]}
        </button>
      )}
      className={cn("shrink-0", className)}
      listClassName="w-52"
      onShow={onShow}
    >
      {(close) => (
        <>
          <p className="px-3 pt-1 pb-1.5 font-bold text-muted text-xs">
            {t.app.shelf.order}
          </p>
          {SHELF_ORDERS.map((o) => (
            <button
              aria-pressed={order === o}
              className={DROP_ITEM}
              key={o}
              onClick={() => {
                onPick(o);
                close();
              }}
              type="button"
            >
              {t.app.shelf[o]}
              {order === o && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </>
      )}
    </DropMenu>
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
