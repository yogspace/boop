"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Snapshot } from "valtio";
import { Plus, Sparkle, Squiggle } from "@/components/doodles";
import { BADGE } from "@/components/ui";
import { type StampDoc, stampsOf } from "@/features/calendar/model";
import { usePalette } from "@/features/calendar/palette-provider";
import { useBoop } from "@/features/offline/store";
import { Sticker } from "@/features/stickers/sticker";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { CalendarLeaf } from "./calendar-leaf";
import { NameTag } from "./name-tag";
import { OrderMenu } from "./order-menu";
import {
  keepOrder,
  lastUsed,
  readOrder,
  recentFirst,
  type ShelfGroup,
  type ShelfOrder,
  shelve,
} from "./shelf";

// Where the day's tray and the app have always found them.
export { OrderMenu } from "./order-menu";
export { StampPile } from "./stamp-pile";

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
  // the shelf (stamp-pile.tsx).
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
 * after them all; a little menu under the page's title picks the order.
 * Beside the title, the way back to the calendar shown last (`back`,
 * `onBack`): a leaf of it, where the pile lies on the calendars' page
 * (calendar-leaf.tsx). A tap opens a stamp's sheet. Someone else's stamp
 * wears their first name; one that came to the account (a card, a gift)
 * says from whom – in sections the heading says it; one of mine that
 * others may use too, two rings.
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
      {/* The page's title, where the calendars greet – as large; beside
        it, where the pile lies there, the way back (calendar-leaf.tsx).
        The order under the title. */}
      <div className="-mt-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col items-start">
          {/* On the smallest phones a little smaller: beside the leaf it
            would break. */}
          <h1 className="wrap-break-word text-4xl max-[379px]:text-[2rem] sm:text-5xl">
            {t.app.stamps}
          </h1>
          {/* The wave swings below its picture's edge (its troughs reach
            past the viewBox, doodles.tsx) – so the picture may not cut
            it off. */}
          <Squiggle className="h-3 w-28 sm:w-32" />
          {/* One stamp: one order is like the other – no menu. */}
          {count > 1 && (
            <OrderMenu
              className="mt-4"
              locale={locale}
              onPick={onOrder}
              order={order}
            />
          )}
        </div>
        <CalendarLeaf href={back} locale={locale} me={me} onOpen={onBack} />
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
