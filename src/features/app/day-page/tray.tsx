"use client";

import { memo, type RefObject } from "react";
import { ArrowRight, Plus, Sparkle } from "@/components/doodles";
import type { ColorName } from "@/features/calendar/model";
import { knownKey } from "@/features/calendar/palette";
import { usePalette } from "@/features/calendar/palette-provider";
import { Sticker } from "@/features/stickers/sticker";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { opensHere } from "../address";
import { FADING } from "../fading-edges";
import { NameTag } from "../name-tag";
import { OrderMenu } from "../order-menu";
import type { ShelfOrder } from "../shelf";
import { NAME_UNDER } from "../stamp-shelf";
import { type Stamp, tidy } from "./prints";
import { CAPTION } from "./tools";

/**
 * A day's tray (day-page.tsx): the stamps, their order right beside their
 * word, to pick (one choice with the shelf's), and at the end of the line
 * the way to the shelf; a new one last. Drawn again only when what it
 * shows changes – not as prints are picked or moved on the page.
 */
export const Tray = memo(function Tray({
  locale,
  stamps,
  held,
  ink,
  turn,
  onTake,
  print,
  order,
  onOrder,
  onSorting,
  shelf,
  onShelf,
  onNew,
  row,
}: {
  locale: Locale;
  stamps: readonly Stamp[];
  /** The stamp in hand. */
  held: string | null;
  ink: ColorName;
  /** How far the stamp in hand is turned. */
  turn: RefObject<number>;
  /** A stamp taken into the hand – or put down (`null`). */
  onTake: (id: string | null) => void;
  print: (
    stamp: Stamp,
    at: { x: number; y: number },
    rotation: number,
    inked: ColorName
  ) => void;
  order: ShelfOrder;
  onOrder: (order: ShelfOrder) => void;
  /** Told whether the order's menu is open – Escape is its, first. */
  onSorting: (open: boolean) => void;
  shelf: string;
  onShelf: () => void;
  onNew: () => void;
  /** The stamps' row – where a stamp handed in is brought into sight. */
  row: (box: HTMLDivElement | null) => (() => void) | undefined;
}) {
  const t = dictionaryOf(locale);
  const palette = usePalette();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1">
        <span className={CAPTION}>{t.app.stamps}</span>
        {stamps.length > 1 && (
          <OrderMenu
            locale={locale}
            onPick={onOrder}
            onShow={onSorting}
            order={order}
          />
        )}
        <a
          className="group ml-auto flex shrink-0 items-center gap-1 py-1 font-bold text-sm"
          href={shelf}
          onClick={(event) => {
            if (!opensHere(event)) return;
            event.preventDefault();
            onShelf();
          }}
        >
          <span className="group-hover:scribble-underline">
            {t.app.allStamps}
          </span>
          <ArrowRight className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
        </a>
      </div>
      {stamps.length === 0 && (
        <p className="text-muted text-sm">{t.app.noStamps}</p>
      )}
      {/* The stamps stand free, no frame each: the one in hand is lifted
        and ringed with the marker. A new one is drawn from the last tile.
        Where nothing points (a finger), each wears its name right under it
        – one line, always there, so the rows are as high with names as
        without.
        On a phone, two rows to swipe – sideways only: up and down the
        swipe is the page's. No bar; it fades where it goes on
        (fading-edges.ts). Room all round inside the scroller (it clips
        both ways): a stamp can lift, turn and wear its ring and focus ring
        without losing a corner – 20px above and below: with less, the rows
        would scroll up and down by what sticks out. Wider, a little
        larger, they wrap – as many to a row as fit, close together from
        the left, all in sight: nothing scrolls, cuts or fades. Beside the
        page larger still, three to a row – four in a large day's sheet –
        just as wide as the tools over them. */}
      <div
        className={cn(
          "-m-4 grid auto-cols-[4.75rem] grid-flow-col grid-rows-2 items-start gap-x-3 gap-y-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 py-5 sm:m-0 sm:grid-flow-row sm:grid-cols-[repeat(auto-fill,5.5rem)] sm:grid-rows-none sm:gap-4 sm:overflow-visible sm:mask-none sm:px-0 sm:py-2 @2xl:grid-cols-[repeat(auto-fill,6rem)]",
          FADING.x
        )}
        ref={row}
      >
        {stamps.map((s) => (
          <div
            className="flex w-19 shrink-0 flex-col sm:w-22 @2xl:w-24"
            data-stamp={s.id}
            key={s.id}
          >
            {/* Its name on a tag when pointed at – in the top layer, so the
              scroller doesn't clip it. (Another anchor than the shelf's.) */}
            <NameTag id={`tray-${s.id}`} text={s.name}>
              {({ onClick: hideTag, ...anchor }) => (
                <button
                  {...anchor}
                  aria-label={s.name || t.app.day.print}
                  aria-pressed={held === s.id}
                  className={cn(
                    "scribble scribble-clear relative h-19 w-19 shrink-0 rounded-[26px] p-0.5 transition-transform duration-150 ease-out [--scribble-inset:-4px] sm:h-22 sm:w-22 @2xl:h-24 @2xl:w-24",
                    held === s.id
                      ? "scribble-bold -translate-y-1"
                      : "scribble-bare hover:-rotate-6 hover:scribble-soft active:scale-90"
                  )}
                  onClick={(event) => {
                    hideTag();
                    // By keyboard there is no pointing at the page: the
                    // stamp comes down somewhere on it – in the hand's ink
                    // if it is the one held, else in its own.
                    if (event.detail === 0) {
                      const spot = () => 0.25 + Math.random() * 0.5;
                      print(
                        s,
                        { x: spot(), y: spot() },
                        tidy(turn.current),
                        held === s.id ? ink : knownKey(s.color, palette)
                      );
                      return;
                    }
                    onTake(held === s.id ? null : s.id);
                  }}
                  type="button"
                >
                  <span className="block">
                    <Sticker className="pointer-events-none" stamp={s} />
                  </span>
                  {s.drawing?.special && (
                    // A stamp for the big days.
                    <Sparkle className="pointer-events-none absolute top-0.5 right-0.5 h-3.5 w-3.5 text-ink" />
                  )}
                </button>
              )}
            </NameTag>
            {/* Said by the button already. */}
            <span
              aria-hidden="true"
              className={cn(
                NAME_UNDER,
                "hidden h-4 [@media(hover:none)]:block",
                held === s.id && "text-ink"
              )}
            >
              {s.name}
            </span>
          </div>
        ))}
        {/* A new one, last – drawn, it comes back into the hand. */}
        <button
          className="scribble scribble-dashed group flex h-19 w-19 shrink-0 flex-col items-center justify-center gap-1 rounded-3xl px-1 text-center font-bold text-[11px] leading-tight transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scribble-boil active:translate-y-px active:scale-[0.97] sm:h-22 sm:w-22 @2xl:h-24 @2xl:w-24"
          onClick={onNew}
          type="button"
        >
          <span className="scribble scribble-sm scribble-ink flex h-8 w-8 items-center justify-center rounded-full transition-transform duration-200 group-hover:rotate-90">
            <Plus className="h-4 w-4" />
          </span>
          {t.app.newStamp}
        </button>
      </div>
    </div>
  );
});
