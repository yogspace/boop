"use client";

import { m } from "motion/react";
import type { Snapshot } from "valtio";
import { Plus } from "@/components/doodles";
import { SPRING } from "@/components/motion";
import type { StampDoc } from "@/features/calendar/model";
import { Sticker } from "@/features/stickers/sticker";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { opensHere } from "./address";

/**
 * The soft paper the pile lies on – and its counterpart on the shelf, the
 * way back (calendar-leaf.tsx): a button, as one sees, though without a
 * line. Pointed at, it comes out a little stronger; the keyboard's ring is
 * the dashed one every frame has. Its padding reaches out by as much as it
 * pads: the pile takes no more room than without it, and nothing beside it
 * moves.
 */
export const SIGNPOST =
  "scribble scribble-bare -mx-2 -mt-1.5 -mb-2 rounded-3xl px-2 pt-2 pb-2 [--scribble-fill:color-mix(in_oklab,var(--color-card)_55%,transparent)] hover:[--scribble-fill:color-mix(in_oklab,var(--color-card)_85%,transparent)] focus-visible:[--scribble-fill:color-mix(in_oklab,var(--color-card)_85%,transparent)]";

/** Where a stamp of the pile lies – by how many there are, the top one first. */
type Toss = { x: number; y: number; rotate: number };

/**
 * The pile, as set down (`rest`) and fanned out a little further
 * (`fanned`) – a few px, a few degrees: two half under the top one, one
 * to each side; of two, one askew behind the other; one alone only turned.
 */
const TOSSES: Record<number, { rest: Toss; fanned: Toss }[]> = {
  1: [{ rest: { x: 0, y: 0, rotate: -6 }, fanned: { x: 0, y: -2, rotate: 4 } }],
  2: [
    { rest: { x: 8, y: 2, rotate: 7 }, fanned: { x: 12, y: 1, rotate: 12 } },
    {
      rest: { x: -9, y: -1, rotate: -12 },
      fanned: { x: -14, y: -3, rotate: -20 },
    },
  ],
  3: [
    { rest: { x: 1, y: 3, rotate: -4 }, fanned: { x: 1, y: 2, rotate: -2 } },
    {
      rest: { x: -15, y: -1, rotate: -16 },
      fanned: { x: -21, y: -3, rotate: -25 },
    },
    {
      rest: { x: 15, y: -3, rotate: 13 },
      fanned: { x: 21, y: -5, rotate: 22 },
    },
  ],
};

/**
 * The way to the shelf (stamp-shelf.tsx), beside the greeting: a little
 * pile of the stamps last stamped with (`useShelf`'s `latest`) – two or
 * three of the 3D stamps, as on the shelf, set down overlapping, each a
 * little turned and off the middle, the latest in front – and under it,
 * small, their word and how many there are – on a soft patch of paper
 * (`SIGNPOST`). Pointed at or focused, the pile fans out a little further.
 * None yet: a dashed spot with a plus, where they will lie.
 *
 * Its room is kept from the start: a picture still being made leaves its
 * spot empty, and fades in once it is there – softly, not with the pop a
 * picture has elsewhere (sticker.tsx): the pile sits by the greeting, and
 * stays calm.
 *
 * A link to the shelf's address (`href`), followed in place (`onOpen`) –
 * a new tab or window gets the address itself.
 */
export const StampPile = ({
  stamps,
  count,
  href,
  locale,
  onOpen,
}: {
  stamps: readonly Snapshot<StampDoc>[];
  /** All the shelf's. */
  count: number;
  href: string;
  locale: Locale;
  onOpen: () => void;
}) => {
  const t = dictionaryOf(locale);
  const tosses = TOSSES[stamps.length] ?? [];
  return (
    <m.a
      animate="rest"
      aria-label={t.app.pile(count)}
      className={cn(
        "group flex shrink-0 flex-col items-center gap-1.5",
        SIGNPOST
      )}
      href={href}
      initial={false}
      onClick={(event) => {
        if (!opensHere(event)) return;
        event.preventDefault();
        onOpen();
      }}
      whileFocus="fanned"
      whileHover="fanned"
    >
      <span className="relative h-14 w-22 sm:h-16 sm:w-26 [&_:is(img,svg)]:animate-fade">
        {stamps.length === 0 ? (
          <span className="scribble scribble-dashed scribble-sm scribble-clear absolute inset-0 m-auto flex h-11 w-11 -rotate-6 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:rotate-3 sm:h-13 sm:w-13">
            <Plus className="h-5 w-5" />
          </span>
        ) : (
          // The latest last, so it lies on top.
          tosses
            .map((toss, i) => ({ toss, stamp: stamps[i] }))
            .reverse()
            .map(({ toss, stamp }) => (
              <m.span
                className="absolute inset-0 m-auto h-14 w-14 sm:h-16 sm:w-16"
                key={stamp.id}
                transition={SPRING.soft}
                variants={toss}
              >
                <Sticker look="never" stamp={stamp} />
              </m.span>
            ))
        )}
      </span>
      {/* As wide as the pile – longer, it reaches out both ways over its
        paper's padding: the pile and the leaf on the shelf (calendar-leaf.tsx)
        are as wide, whatever they say. */}
      <span className="flex w-22 justify-center whitespace-nowrap font-bold text-[11px] text-muted leading-none transition-colors group-hover:text-ink sm:w-26 sm:text-xs">
        {t.app.stamps}
        {count > 0 && ` · ${count}`}
      </span>
    </m.a>
  );
};
