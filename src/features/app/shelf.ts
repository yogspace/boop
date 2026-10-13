// Relative, not `@/…`: the unit tests import this without the app's aliases.
import type { StampOrigin } from "../cards/protocol";

/**
 * The shelf's order (boop-app.tsx) – the stamps an account stamps with, all
 * in one, or by whom they are from. Plain functions; which one the shelf
 * shows the device keeps (`readOrder`, `keepOrder`).
 *
 *   newest   the latest first – by `changedAt`: a stamp has no time of its
 *            making, so a renamed one comes to the front too
 *   person   in sections: one's own, then each person's (what they share
 *            with a calendar one is in, and the cards one took from them),
 *            then Boop's gifts
 */
export type ShelfOrder = "newest" | "person";

export const SHELF_ORDERS = [
  "newest",
  "person",
] as const satisfies readonly ShelfOrder[];

type Shelved = {
  id: string;
  owner: string;
  changedAt: string;
  origin?: StampOrigin;
};

/** A section of the shelf, by person. */
export type ShelfGroup<T> = {
  /** Stable, for React – and different for every section. */
  key: string;
  /**
   * `mine`: drawn by oneself. `person`: from someone – their name in
   * `name`, "" for a giver who left none. `boop`: Boop's gifts.
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
export const newestFirst = <T extends Shelved>(stamps: readonly T[]): T[] =>
  [...stamps].sort(
    (a, b) => time(b.changedAt) - time(a.changedAt) || a.id.localeCompare(b.id)
  );

/**
 * The stamps in sections: one's own, then each person's – sorted by name –,
 * then Boop's; in each, the latest first. A person is an account: someone's
 * stamp shared with one of my calendars, and the cards I took from them,
 * are one section. A card whose giver's account is gone goes by the name it
 * came with. Names come from `nameOf` – the people the device knows, by id
 * ("" for someone it doesn't) – and else from the card. Only sections with
 * stamps; mine always (the shelf's “new stamp” is in it).
 */
export const byPerson = <T extends Shelved>(
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

/** Where the device keeps the shelf's order. */
const ORDER_KEY = "boop-shelf-order";

/** The order this device chose – newest first, unless it chose another. */
export const readOrder = (): ShelfOrder => {
  try {
    const kept = localStorage.getItem(ORDER_KEY);
    return kept === "person" ? "person" : "newest";
  } catch {
    return "newest";
  }
};

export const keepOrder = (order: ShelfOrder) => {
  try {
    if (order === "newest") localStorage.removeItem(ORDER_KEY);
    else localStorage.setItem(ORDER_KEY, order);
  } catch {
    // No storage – the order holds until the page goes.
  }
};
