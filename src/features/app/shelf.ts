// Relative, not `@/…`: the unit tests import this without the app's aliases.
import type { StampOrigin } from "../cards/protocol";

/**
 * The order of the stamps an account stamps with – on the shelf
 * (stamp-shelf.tsx) and in a day's tray (day-page/tray.tsx) alike: one
 * choice for both. Plain functions; which one is chosen the device keeps
 * (`readOrder`, `keepOrder`).
 *
 *   recent   the ones last stamped with first – by one's own prints
 *            (`lastUsed`). One not stamped with yet counts from when it
 *            came (`changedAt`): a new stamp is right at the front
 *   newest   the latest first – by `changedAt`: a stamp has no time of its
 *            making, so a renamed one comes to the front too
 *   person   in sections: one's own, then each person's (what they share
 *            with a calendar one is in, and the cards one took from them),
 *            then Boop's gifts
 *   color    by color, in the palette's order – in each the latest first
 */
export type ShelfOrder = "recent" | "newest" | "person" | "color";

export const SHELF_ORDERS = [
  "recent",
  "newest",
  "person",
  "color",
] as const satisfies readonly ShelfOrder[];

/** The order before one is chosen – and the one a device keeps no word of. */
const FIRST: ShelfOrder = "recent";

type Shelved = {
  id: string;
  owner: string;
  changedAt: string;
  color: string;
  origin?: StampOrigin;
};

/** A print, as far as when its stamp was used goes. */
type Used = { stamp: string; placedBy: string; changedAt: string };

/** A section of the shelf, by person – or all of them in one (`all`). */
export type ShelfGroup<T> = {
  /** Stable, for React – and different for every section. */
  key: string;
  /**
   * `mine`: drawn by oneself – or, in one section for all, everything.
   * `person`: from someone – their name in `name`, "" for a giver who left
   * none. `boop`: Boop's gifts.
   */
  kind: "mine" | "person" | "boop";
  name: string;
  stamps: T[];
};

const time = (iso: string) => {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? 0 : at;
};

/** The latest change first – the same time: by id, so nothing jumps. */
export const newestFirst = <T extends Omit<Shelved, "color">>(
  stamps: readonly T[]
): T[] =>
  [...stamps].sort(
    (a, b) => time(b.changedAt) - time(a.changedAt) || a.id.localeCompare(b.id)
  );

/**
 * When each stamp was last stamped with, by me (ms) – its latest print of
 * mine; one moved since counts from then. Prints from after `until` don't
 * count yet: what is stamped meanwhile leaves the order as it was.
 */
export const lastUsed = (
  prints: Iterable<Used>,
  me: string | undefined,
  until = Number.POSITIVE_INFINITY
): Map<string, number> => {
  const used = new Map<string, number>();
  for (const print of prints) {
    if (print.placedBy !== me) continue;
    const at = time(print.changedAt);
    if (at > until || at <= (used.get(print.stamp) ?? -1)) continue;
    used.set(print.stamp, at);
  }
  return used;
};

/**
 * The ones last stamped with first (`used`: `lastUsed`'s). One not stamped
 * with yet goes by when it came – a stamp just drawn is first.
 */
export const recentFirst = <T extends Omit<Shelved, "color">>(
  stamps: readonly T[],
  used: ReadonlyMap<string, number>
): T[] => {
  const at = (stamp: T) => used.get(stamp.id) ?? time(stamp.changedAt);
  return [...stamps].sort((a, b) => at(b) - at(a) || a.id.localeCompare(b.id));
};

/**
 * By color, in the order of `colors` (the palette's keys) – a color it no
 * longer has after them, by its key. Of one color the latest first.
 */
export const byColor = <T extends Shelved>(
  stamps: readonly T[],
  colors: readonly string[]
): T[] => {
  const rank = (stamp: T) => {
    const at = colors.indexOf(stamp.color);
    return at < 0 ? colors.length : at;
  };
  // The sort keeps the order it is given where it finds none: newest first.
  return newestFirst(stamps).sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === colors.length ? a.color.localeCompare(b.color) : 0)
  );
};

/**
 * The stamps in sections: one's own, then each person's – sorted by name –,
 * then Boop's; in each, the latest first. A person is an account: someone's
 * stamp shared with one of my calendars, and the cards I took from them,
 * are one section. A card whose giver's account is gone goes by the name it
 * came with. Names come from `nameOf` – the people the device knows, by id
 * ("" for someone it doesn't) – and else from the card. Only sections with
 * stamps; mine always – first, also empty.
 */
export const byPerson = <T extends Omit<Shelved, "color">>(
  stamps: readonly T[],
  me: string | undefined,
  nameOf: (id: string) => string
): ShelfGroup<T>[] => {
  const mine: ShelfGroup<T> = {
    key: "mine",
    kind: "mine",
    name: "",
    stamps: [],
  };
  const boop: ShelfGroup<T> = {
    key: "boop",
    kind: "boop",
    name: "",
    stamps: [],
  };
  const people = new Map<string, ShelfGroup<T>>();
  const person = (key: string, name: string) => {
    let group = people.get(key);
    if (!group) {
      group = { key, kind: "person", name, stamps: [] };
      people.set(key, group);
    }
    // The first with a name names it.
    if (!group.name) group.name = name;
    return group;
  };
  for (const stamp of newestFirst(stamps)) {
    const { origin } = stamp;
    if (stamp.owner !== me) {
      person(`person:${stamp.owner}`, nameOf(stamp.owner)).stamps.push(stamp);
    } else if (!origin) {
      mine.stamps.push(stamp);
    } else if (origin.kind === "gift") {
      boop.stamps.push(stamp);
    } else if (origin.from) {
      person(
        `person:${origin.from}`,
        nameOf(origin.from) || origin.name.trim()
      ).stamps.push(stamp);
    } else {
      const name = origin.name.trim();
      person(`name:${name.toLowerCase()}`, name).stamps.push(stamp);
    }
  }
  const named = [...people.values()].sort(
    (a, b) =>
      // Nameless last among the people.
      Number(!a.name) - Number(!b.name) ||
      a.name.localeCompare(b.name) ||
      a.key.localeCompare(b.key)
  );
  return [mine, ...named, ...(boop.stamps.length ? [boop] : [])];
};

/**
 * The stamps in the order chosen: by person in sections (`byPerson`), any
 * other all in one – a single section, `all`. `used` is `lastUsed`'s,
 * `colors` the palette's keys in its order.
 */
export const shelve = <T extends Shelved>(
  stamps: readonly T[],
  order: ShelfOrder,
  {
    me,
    nameOf,
    used,
    colors,
  }: {
    me: string | undefined;
    nameOf: (id: string) => string;
    used: ReadonlyMap<string, number>;
    colors: readonly string[];
  }
): ShelfGroup<T>[] => {
  if (order === "person") return byPerson(stamps, me, nameOf);
  const all =
    order === "recent"
      ? recentFirst(stamps, used)
      : order === "color"
        ? byColor(stamps, colors)
        : newestFirst(stamps);
  return [{ key: "all", kind: "mine", name: "", stamps: all }];
};

/** Where the device keeps the order. */
const ORDER_KEY = "boop-shelf-order";

const isOrder = (value: unknown): value is ShelfOrder =>
  SHELF_ORDERS.some((order) => order === value);

/** The order this device chose – last used first, unless it chose another. */
export const readOrder = (): ShelfOrder => {
  try {
    const kept = localStorage.getItem(ORDER_KEY);
    return isOrder(kept) ? kept : FIRST;
  } catch {
    return FIRST;
  }
};

export const keepOrder = (order: ShelfOrder) => {
  try {
    if (order === FIRST) localStorage.removeItem(ORDER_KEY);
    else localStorage.setItem(ORDER_KEY, order);
  } catch {
    // No storage – the order holds until the page goes.
  }
};
