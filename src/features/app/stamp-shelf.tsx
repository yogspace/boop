"use client";

import { m } from "motion/react";
import type { Snapshot } from "valtio";
import { Plus, Sparkle, Squiggle } from "@/components/doodles";
import { SPRING } from "@/components/motion";
import { BADGE } from "@/components/ui";
import type { StampDoc } from "@/features/calendar/model";
import { Sticker } from "@/features/stickers/sticker";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { NameTag } from "./name-tag";
import { SHELF_ORDERS, type ShelfGroup, type ShelfOrder } from "./shelf";

type Stamp = Snapshot<StampDoc>;

/** The shelf's id on the page – to bring it into sight (`scrollIntoView`). */
export const SHELF_ID = "shelf";

/** A stable little tilt per stamp – the shelf looks hand-placed. */
const tilt = (id: string) => ((id.charCodeAt(0) + id.charCodeAt(5)) % 9) - 4;

/**
 * The shelf: the stamps the account stamps with, a button for a new one
 * first – all in one, the latest first, or in sections by whom they are
 * from (shelf.ts); a little switch above it picks. Someone else's stamp
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
  onOrder,
  onNew,
  onOpen,
}: {
  /** In order – the first is mine, with the button for a new one. */
  groups: ShelfGroup<Stamp>[];
  order: ShelfOrder;
  me: string | undefined;
  /** Names by account. */
  people: Readonly<Record<string, string>>;
  locale: Locale;
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
  // Only mine: one order is like the other – no switch.
  const fromOthers = groups.some((group) =>
    group.stamps.some((s) => s.owner !== me || s.origin)
  );
  const titleOf = (group: ShelfGroup<Stamp>) =>
    group.kind === "mine"
      ? t.app.shelf.mine
      : group.kind === "boop"
        ? t.app.shelf.boop
        : group.name || t.app.shelf.gifted;

  return (
    <section
      className="flex scroll-mt-4 flex-col gap-4 lg:sticky lg:top-6"
      id={SHELF_ID}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div>
          <h2 className="text-3xl">{t.app.stamps}</h2>
          {/* The wave swings below its picture's edge (its troughs reach
            past the viewBox, doodles.tsx) – so the picture may not cut
            it off. */}
          <Squiggle className="h-3 w-24" />
        </div>
        {fromOthers && (
          <OrderSwitch locale={locale} onPick={onOrder} order={order} />
        )}
      </div>
      {groups.map((group, index) => (
        <div className="flex flex-col gap-3" key={group.key}>
          {sectioned && (index > 0 || groups.length > 1) && (
            <h3 className="flex items-center gap-1.5 font-black text-lg leading-tight">
              <span className="wrap-break-word min-w-0">{titleOf(group)}</span>
              {group.kind === "boop" && (
                <Sparkle className="h-4 w-4 shrink-0 -rotate-12" />
              )}
              <span className="font-bold text-muted text-sm">
                · {group.stamps.length}
              </span>
            </h3>
          )}
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-3">
            {index === 0 && (
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
            )}
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
                  className="relative"
                  key={s.id}
                  style={{ transform: `rotate(${tilt(s.id)}deg)` }}
                >
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
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {count === 0 && (
        <p className="font-medium text-muted">{t.app.noStamps}</p>
      )}
    </section>
  );
};

/**
 * The shelf's two orders side by side in a drawn pill – the one in use
 * marked with the highlighter, like the calendar's views (view-switch.tsx).
 */
const OrderSwitch = ({
  order,
  locale,
  onPick,
}: {
  order: ShelfOrder;
  locale: Locale;
  onPick: (order: ShelfOrder) => void;
}) => {
  const t = dictionaryOf(locale);
  return (
    <fieldset className="scribble scribble-sm scribble-thin scribble-clear flex w-fit shrink-0 gap-0.5 rounded-full p-1">
      <legend className="sr-only">{t.app.shelf.order}</legend>
      {SHELF_ORDERS.map((o) => (
        <button
          aria-pressed={order === o}
          className={cn(
            "relative isolate rounded-full px-3 py-1 font-bold text-[13px] transition-colors",
            order === o ? "text-ink" : "text-muted hover:text-ink"
          )}
          key={o}
          onClick={() => onPick(o)}
          type="button"
        >
          {order === o && (
            <m.span
              aria-hidden="true"
              className="scribble scribble-bare scribble-sm absolute inset-0 -z-10 -rotate-1 rounded-full [--scribble-fill:var(--cal-mark,var(--color-soft))]"
              layoutId="shelf-order"
              transition={SPRING.soft}
            />
          )}
          {t.app.shelf[o]}
        </button>
      ))}
    </fieldset>
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
