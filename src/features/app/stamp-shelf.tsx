"use client";

import { AnimatePresence, m } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "valtio";
import {
  ArrowLeft,
  Check,
  Plus,
  Sparkle,
  Squiggle,
} from "@/components/doodles";
import { SPRING } from "@/components/motion";
import { BADGE, buttonClass } from "@/components/ui";
import { type StampDoc, stampsOf } from "@/features/calendar/model";
import { usePalette } from "@/features/calendar/palette-provider";
import { useBoop } from "@/features/offline/store";
import { Sticker } from "@/features/stickers/sticker";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { opensHere } from "./address";
import { NameTag } from "./name-tag";
import {
  keepOrder,
  lastUsed,
  readOrder,
  recentFirst,
  SHELF_ORDERS,
  type ShelfGroup,
  type ShelfOrder,
  shelve,
} from "./shelf";
import { useDismiss } from "./use-dismiss";

type Stamp = Snapshot<StampDoc>;

/**
 * The shelf's rows of stamps: three to a row on a phone, more the wider the
 * screen – seven on a large one, as large as on a tablet.
 */
const GRID =
  "grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7";

/** How many stamps lie on the pile that leads to the shelf. */
const PILE = 3;

/** A stable little tilt per stamp – the shelf looks hand-placed. */
const tilt = (id: string) => ((id.charCodeAt(0) + id.charCodeAt(5)) % 9) - 4;

/**
 * A stamp's name under it, small, on one line – like the names under the
 * icons on a phone. Only where nothing points (a finger: `hover: none`),
 * so no tag hangs from it (name-tag.tsx) – with a mouse the tag says it.
 */
export const NAME_UNDER =
  "min-w-0 truncate text-center font-bold text-[11px] text-muted leading-4";

/**
 * The stamps the account stamps with, in the order the device keeps
 * (shelf.ts) – for the shelf and the day's tray alike, one choice for both:
 * mine and what others share with me, the same in every calendar.
 *
 * “Last used first” goes by one's prints as they were a moment ago
 * (`until`): stamping doesn't shuffle the tray under one's finger. The
 * moment moves on with `settle` – a day's sheet gone, the order picked
 * again, the shelf or the calendars come up – and as the app comes back
 * into sight.
 */
export const useShelf = () => {
  const boop = useBoop();
  const palette = usePalette();
  const me = boop.me?.id;
  // Read right away: nothing of the shelf shows before the device's copy is
  // open.
  const [order, setOrder] = useState<ShelfOrder>(() =>
    typeof window === "undefined" ? "recent" : readOrder()
  );
  const [until, setUntil] = useState(Date.now);
  const settle = useCallback(() => setUntil(Date.now()), []);
  useEffect(() => {
    const back = () => {
      if (document.visibilityState === "visible") settle();
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [settle]);
  const pick = useCallback(
    (next: ShelfOrder) => {
      setOrder(next);
      keepOrder(next);
      settle();
    },
    [settle]
  );
  const used = useMemo(
    () => lastUsed(Object.values(boop.placements), me, until),
    [boop.placements, me, until]
  );
  const colors = useMemo(() => palette.map((color) => color.key), [palette]);
  const groups = useMemo(
    () =>
      shelve(
        stampsOf(Object.values(boop.stamps), me, Object.keys(boop.calendars)),
        order,
        { me, nameOf: (id) => boop.people[id] ?? "", used, colors }
      ),
    [boop.stamps, boop.calendars, boop.people, me, order, used, colors]
  );
  const stamps = useMemo(
    () => groups.flatMap((group) => group.stamps),
    [groups]
  );
  // The few last stamped with, whatever the order – the pile on the way to
  // the shelf (`StampPile`).
  const latest = useMemo(
    () => recentFirst(stamps, used).slice(0, PILE),
    [stamps, used]
  );
  return { order, pick, settle, groups, stamps, latest };
};

/**
 * The shelf – the app's second page, beside the calendars (address.ts): the
 * stamps the account stamps with, large, a button for a new one last – all
 * in one, or in sections by whom they are from (shelf.ts), the button then
 * after them all; a little menu beside the page's title picks the order.
 * Over the title, the way back to the calendars (`onBack`). A tap opens a
 * stamp's sheet. Someone else's stamp wears their first name;
 * one that came to the account (a card, a gift) says from whom – in
 * sections the heading says it; one of mine that others may use too, two
 * rings.
 */
export const StampShelf = ({
  groups,
  order,
  me,
  people,
  locale,
  back,
  onBack,
  onOrder,
  onNew,
  onOpen,
}: {
  /** In order – by person, the first is mine. */
  groups: ShelfGroup<Stamp>[];
  order: ShelfOrder;
  me: string | undefined;
  /** Names by account. */
  people: Readonly<Record<string, string>>;
  locale: Locale;
  /** The calendars' address – the calendar shown before – and the way there. */
  back: string;
  onBack: () => void;
  onOrder: (order: ShelfOrder) => void;
  onNew: () => void;
  onOpen: (id: string) => void;
}) => {
  const t = dictionaryOf(locale);
  const firstName = (name: string) => name.split(" ")[0] ?? "";
  const nameOf = (id: string) => firstName(people[id] ?? "") || "?";
  // Whose it is, or where it came from – nothing for one I drew.
  const whose = (s: Stamp) => {
    if (s.owner !== me) return t.app.stamp.by(nameOf(s.owner));
    if (s.origin) return t.app.stamp.origin(firstName(s.origin.name));
    return s.sharedWith.length > 0 ? t.app.stamp.shared : "";
  };
  const sectioned = order === "person";
  const count = groups.reduce((n, group) => n + group.stamps.length, 0);
  const titleOf = (group: ShelfGroup<Stamp>) =>
    group.kind === "mine"
      ? t.app.shelf.mine
      : group.kind === "boop"
        ? t.app.shelf.boop
        : group.name || t.app.shelf.gifted;
  // A new one – after the last stamp, or in sections after them all.
  const newOne = (
    <li>
      <button
        className="scribble scribble-dashed group flex aspect-square w-full flex-col items-center justify-center gap-1.5 text-balance rounded-3xl px-2 text-center font-bold text-[13px] leading-tight transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scribble-boil active:translate-y-px active:scale-[0.97]"
        onClick={onNew}
        type="button"
      >
        <span className="scribble scribble-sm scribble-ink flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-200 group-hover:rotate-90">
          <Plus className="h-5 w-5" />
        </span>
        {t.app.newStamp}
      </button>
    </li>
  );

  return (
    <section className="flex flex-col gap-6">
      {/* The page's title, where the calendars greet – as large; the way
        back over it. */}
      <div className="-mt-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="flex flex-col items-start">
          <a
            className="group -my-1 flex items-center gap-1 py-1 font-bold text-muted text-sm transition-colors hover:text-ink"
            href={back}
            onClick={(event) => {
              if (!opensHere(event)) return;
              event.preventDefault();
              onBack();
            }}
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
            <span className="group-hover:scribble-underline">
              {t.app.backToCalendars}
            </span>
          </a>
          <h1 className="text-4xl sm:text-5xl">{t.app.stamps}</h1>
          {/* The wave swings below its picture's edge (its troughs reach
            past the viewBox, doodles.tsx) – so the picture may not cut
            it off. */}
          <Squiggle className="h-3 w-28 sm:w-32" />
        </div>
        {/* One stamp: one order is like the other – no menu. */}
        {count > 1 && (
          <OrderMenu locale={locale} onPick={onOrder} order={order} />
        )}
      </div>
      {groups.map((group, index) => (
        <div className="flex flex-col gap-3" key={group.key}>
          {sectioned && (index > 0 || groups.length > 1) && (
            <h2 className="flex items-center gap-1.5 font-black text-lg leading-tight">
              <span className="wrap-break-word min-w-0">{titleOf(group)}</span>
              {group.kind === "boop" && (
                <Sparkle className="h-4 w-4 shrink-0 -rotate-12" />
              )}
              <span className="font-bold text-muted text-sm">
                · {group.stamps.length}
              </span>
            </h2>
          )}
          <ul className={GRID}>
            {group.stamps.map((s) => {
              // In sections, the heading says whom a stamp is from.
              const badge = sectioned
                ? null
                : s.owner !== me
                  ? nameOf(s.owner)
                  : s.origin
                    ? t.app.stamp.origin(firstName(s.origin.name))
                    : null;
              const label = [s.name, whose(s)].filter(Boolean).join(" – ");
              return (
                <li
                  className="flex min-w-0 flex-col gap-0.5"
                  key={s.id}
                  style={{ transform: `rotate(${tilt(s.id)}deg)` }}
                >
                  <div className="relative">
                    <NameTag id={s.id} text={label}>
                      {({ onClick, ...anchor }) => (
                        <button
                          {...anchor}
                          aria-label={[s.name || t.app.stamp.untitled, whose(s)]
                            .filter(Boolean)
                            .join(" – ")}
                          className="scribble scribble-bare flex aspect-square w-full items-center justify-center rounded-3xl p-1 hover:animate-wiggle hover:scribble-soft"
                          onClick={() => {
                            onClick();
                            onOpen(s.id);
                          }}
                          type="button"
                        >
                          <Sticker stamp={s} />
                        </button>
                      )}
                    </NameTag>
                    {s.drawing?.special && (
                      // A stamp for the big days.
                      <Sparkle className="pointer-events-none absolute top-1 right-1 h-4 w-4 text-ink" />
                    )}
                    {badge ? (
                      <span className="pointer-events-none absolute right-0 bottom-0 flex max-w-full">
                        <span className={cn(BADGE, "min-w-0")}>
                          <span className="truncate">{badge}</span>
                        </span>
                      </span>
                    ) : (
                      s.owner === me &&
                      !s.origin &&
                      s.sharedWith.length > 0 && (
                        <SharedSign className="pointer-events-none absolute right-1 bottom-1 h-4 w-4" />
                      )
                    )}
                  </div>
                  {s.name && (
                    // The button says it to a screen reader already.
                    <span
                      aria-hidden="true"
                      className={cn(
                        NAME_UNDER,
                        "hidden px-1 [@media(hover:none)]:block"
                      )}
                    >
                      {s.name}
                    </span>
                  )}
                </li>
              );
            })}
            {!sectioned && index === groups.length - 1 && newOne}
          </ul>
        </div>
      ))}
      {sectioned && <ul className={GRID}>{newOne}</ul>}
      {count === 0 && (
        <p className="font-medium text-muted">{t.app.noStamps}</p>
      )}
    </section>
  );
};

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
 * The way to the shelf, beside the greeting: a little pile of the stamps
 * last stamped with (`useShelf`'s `latest`) – two or three of the 3D
 * stamps, as on the shelf, set down overlapping, each a little turned and
 * off the middle, the latest in front – and under it, small, their word and
 * how many there are. Pointed at or focused, the pile fans out a little
 * further. None yet: a dashed spot with a plus, where they will lie.
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
  stamps: readonly Stamp[];
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
      className="group flex shrink-0 flex-col items-center gap-1.5 pt-0.5"
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
      <span className="whitespace-nowrap font-bold text-[11px] text-muted leading-none transition-colors group-hover:text-ink sm:text-xs">
        {t.app.stamps}
        {count > 0 && ` · ${count}`}
      </span>
    </m.a>
  );
};

/**
 * The stamps' order (shelf.ts), as a little button with the one in use –
 * pressed, the four fold out under it to pick from. On the shelf and over a
 * day's tray, one choice for both. Escape folds them away first – before a
 * sheet the tray is in hears it and closes.
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
  useDismiss(open, () => setOpen(false), button, box);
  useEffect(() => onShow?.(open), [open, onShow]);
  // Unfolded at the bottom of a sheet (the day's tray), it would hang out
  // of sight below: what scrolls around it brings it in – clear of the
  // fading edge (`scroll-my-12`).
  useEffect(() => {
    if (open)
      box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
            className="scribble absolute top-full right-0 z-40 mt-2 flex w-52 origin-top-right scroll-my-12 flex-col gap-0.5 rounded-3xl p-2"
            exit={{
              y: -6,
              scale: 0.96,
              opacity: 0,
              transition: { duration: 0.15, ease: "easeIn" },
            }}
            initial={{ y: -8, scale: 0.96, opacity: 0 }}
            ref={box}
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

/** Two rings, one over the other – a stamp of mine that others may use too. */
const SharedSign = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeWidth="2.4"
    viewBox="0 0 24 24"
  >
    <circle cx="8.5" cy="12" r="5.5" />
    <circle cx="15.5" cy="12" r="5.5" />
  </svg>
);
