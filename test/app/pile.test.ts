import { describe, expect, it } from "vitest";
import {
  type Laid,
  layoutPrints,
  type PilePrint,
  type Room,
  TURN,
  varietyFirst,
} from "../../src/features/app/pile";

/** A day of the month on a phone (390px wide) and on a desk. */
const PHONE: Room = {
  width: 51,
  height: 51,
  inset: 4,
  over: 3,
  corner: { width: 23, height: 18 },
  badge: { width: 19, height: 16 },
  smallest: 13,
  biggest: 30,
  most: 16,
};
const DESK: Room = {
  width: 98,
  height: 98,
  inset: 8,
  over: 5,
  corner: { width: 32, height: 26 },
  badge: { width: 30, height: 21 },
  smallest: 20,
  biggest: 58,
  most: 16,
};
/** A day in the year's table on a phone – no number in it. */
const YEAR: Room = {
  width: 28,
  height: 24,
  inset: 1,
  over: 1.5,
  badge: { width: 16, height: 11 },
  smallest: 13,
  biggest: 20,
  most: 8,
};

const printsOf = (count: number, salt = 0): PilePrint[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${(0x3f2a10 + i * 7919 + salt * 104729).toString(16)}-print-${i}`,
    z: count - i,
  }));

/** How far a laid print reaches from its middle, turned. */
const reachOf = ({ size, turn }: Laid<PilePrint>) => {
  const rad = (turn * Math.PI) / 180;
  return (size / 2) * (Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad)));
};

const DAYS = ["2026-10-02", "2026-10-17", "2027-02-28"];

/** A whole year of days – each with prints of its own. */
const YEAR_DAYS = Array.from({ length: 365 }, (_, i) =>
  new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10)
);

/** Every pile of a year of days, of these many prints, in a room. */
const pilesOf = (room: Room, counts: readonly number[]) =>
  YEAR_DAYS.flatMap((day, salt) =>
    counts.map((count) => layoutPrints(printsOf(count, salt), room, day))
  );

/** How far a laid print reaches into a corner – the shorter way out. */
const depthIn = (
  print: Laid<PilePrint>,
  x0: number,
  y0: number,
  x1: number,
  y1: number
) => {
  const reach = reachOf(print);
  const inside =
    print.x + reach > x0 &&
    print.x - reach < x1 &&
    print.y + reach > y0 &&
    print.y - reach < y1;
  return inside
    ? Math.min(
        x0 === 0 ? x1 - (print.x - reach) : print.x + reach - x0,
        y0 === 0 ? y1 - (print.y - reach) : print.y + reach - y0
      )
    : 0;
};

describe("layoutPrints", () => {
  it("lays the same prints the same way, every time", () => {
    const prints = printsOf(9);
    const once = layoutPrints(prints, PHONE, "2026-10-12");
    const again = layoutPrints(
      printsOf(9).map((p) => ({ ...p })),
      { ...PHONE },
      "2026-10-12"
    );
    expect(again).toEqual(once);
  });

  it("lays a print differently on another day – but turns it no further than a little", () => {
    const [print] = printsOf(1);
    const turns = DAYS.map(
      (day) => layoutPrints([print], DESK, day).laid[0].turn
    );
    expect(new Set(turns).size).toBe(DAYS.length);
    for (const turn of turns) expect(Math.abs(turn)).toBeLessThanOrEqual(TURN);
  });

  it("keeps every print within the day – a few pixels over its line at most", () => {
    for (const room of [PHONE, DESK, YEAR]) {
      for (const count of [1, 2, 3, 5, 8, 12, 15, 30]) {
        for (const day of DAYS) {
          const { laid } = layoutPrints(printsOf(count), room, day);
          for (const print of laid) {
            const reach = reachOf(print);
            expect(print.x - reach).toBeGreaterThanOrEqual(-room.over - 1e-6);
            expect(print.y - reach).toBeGreaterThanOrEqual(-room.over - 1e-6);
            expect(print.x + reach).toBeLessThanOrEqual(
              room.width + room.over + 1e-6
            );
            expect(print.y + reach).toBeLessThanOrEqual(
              room.height + room.over + 1e-6
            );
          }
        }
      }
    }
  });

  it("keeps the number's corner clear – a few pixels under it at most", () => {
    for (const room of [PHONE, DESK]) {
      const corner = room.corner ?? { width: 0, height: 0 };
      for (const { laid } of pilesOf(room, [1, 2, 3, 4, 6, 9, 15])) {
        for (const print of laid) {
          expect(
            depthIn(print, 0, 0, corner.width, corner.height)
          ).toBeLessThanOrEqual(3.5);
        }
      }
    }
  });

  it("never lays one print right on another", () => {
    for (const room of [PHONE, DESK, YEAR]) {
      for (const { laid } of pilesOf(room, [2, 3, 5, 9, 15, 30])) {
        for (const [i, a] of laid.entries()) {
          for (const b of laid.slice(i + 1)) {
            // Moved apart to 0.4 of a print – where crowded, a little less.
            const apart = Math.hypot(a.x - b.x, a.y - b.y);
            expect(apart).toBeGreaterThanOrEqual(
              0.3 * Math.min(a.size, b.size)
            );
          }
        }
      }
    }
  });

  it("shows many prints, smaller the more there are – “+n” only past the smallest", () => {
    const sizes: number[] = [];
    for (let count = 1; count <= 8; count++) {
      const { laid, more } = layoutPrints(printsOf(count), PHONE, DAYS[0]);
      expect(laid).toHaveLength(count);
      expect(more).toBe(0);
      sizes.push(Math.max(...laid.map((p) => p.size)));
    }
    expect(sizes[7]).toBeLessThan(sizes[0]);
    // A crowded phone day still shows eight, at no less than the smallest.
    const busy = layoutPrints(printsOf(15), PHONE, DAYS[1]);
    expect(busy.laid.length).toBeGreaterThanOrEqual(8);
    expect(busy.laid.length + busy.more).toBe(15);
    for (const print of busy.laid) {
      expect(print.size).toBeGreaterThanOrEqual(PHONE.smallest);
    }
    // On a desk all fifteen.
    const desk = layoutPrints(printsOf(15), DESK, DAYS[1]);
    expect(desk.laid).toHaveLength(15);
    expect(desk.more).toBe(0);
    // Never more than `most`.
    const flood = layoutPrints(printsOf(40), DESK, DAYS[2]);
    expect(flood.laid.length).toBeLessThanOrEqual(DESK.most);
    expect(flood.laid.length + flood.more).toBe(40);
  });

  it("shows the year's day four prints even on a phone", () => {
    const { laid, more } = layoutPrints(printsOf(4), YEAR, DAYS[0]);
    expect(laid).toHaveLength(4);
    expect(more).toBe(0);
  });

  it("keeps the corner for “+n” clear – only when there is one", () => {
    // The year's day is tiny: there a print may reach under it a little.
    for (const [room, hair] of [
      [PHONE, 1.5],
      [DESK, 1.5],
      [YEAR, 4],
    ] as const) {
      const badge = room.badge ?? { width: 0, height: 0 };
      for (const { laid, more } of pilesOf(room, [30])) {
        expect(more).toBeGreaterThan(0);
        for (const print of laid) {
          expect(
            depthIn(
              print,
              room.width - badge.width,
              room.height - badge.height,
              room.width,
              room.height
            )
          ).toBeLessThanOrEqual(hair);
        }
      }
    }
    // Four fit the year's day on a phone – the corner is theirs.
    const four = layoutPrints(printsOf(4), YEAR, DAYS[1]).laid;
    expect(
      four.some((p) => p.x > YEAR.width / 2 && p.y > YEAR.height / 2)
    ).toBe(true);
  });

  it("gives room to the first ones, and lays them bottom first", () => {
    const prints = printsOf(30);
    const { laid } = layoutPrints(prints, PHONE, DAYS[0]);
    const shown = new Set(laid.map((p) => p.print.id));
    expect(shown).toEqual(
      new Set(prints.slice(0, laid.length).map((p) => p.id))
    );
    const zs = laid.map((p) => p.print.z);
    expect(zs).toEqual([...zs].sort((a, b) => a - b));
  });

  it("puts a special print over the rest, a little larger", () => {
    const prints = printsOf(4).map((p, i) => ({ ...p, special: i === 3 }));
    const { laid } = layoutPrints(prints, DESK, DAYS[0]);
    const top = laid.at(-1);
    expect(top?.print.special).toBe(true);
    const plain = laid.filter((p) => !p.print.special).map((p) => p.size);
    expect(top?.size).toBeGreaterThan(Math.min(...plain));
  });

  it("lays nothing without prints or room", () => {
    expect(layoutPrints([], PHONE, DAYS[0])).toEqual({ laid: [], more: 0 });
    expect(
      layoutPrints(printsOf(3), { ...PHONE, width: 0, height: 0 }, DAYS[0])
    ).toEqual({ laid: [], more: 0 });
  });
});

describe("varietyFirst", () => {
  it("puts one of each stamp before a second of the same", () => {
    const prints = ["a", "a", "b", "a", "c", "b"].map((kind, i) => ({
      id: `p${i}`,
      kind,
    }));
    expect(varietyFirst(prints, (p) => p.kind).map((p) => p.id)).toEqual([
      "p0",
      "p2",
      "p4",
      "p1",
      "p3",
      "p5",
    ]);
  });
});
