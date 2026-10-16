import { describe, expect, it } from "vitest";
import {
  byColor,
  byPerson,
  lastUsed,
  newestFirst,
  recentFirst,
  shelve,
} from "../../src/features/app/shelf";
import type { StampOrigin } from "../../src/features/cards/protocol";

const stamp = (
  id: string,
  owner: string,
  changedAt: string,
  origin?: StampOrigin
) => ({ id, owner, changedAt, ...(origin && { origin }) });

const NAMES: Record<string, string> = { anna: "Anna Berg", bo: "Bo" };
const nameOf = (id: string) => NAMES[id] ?? "";

describe("newestFirst", () => {
  it("puts the latest change first, the same time by id", () => {
    const stamps = [
      stamp("b", "me", "2026-10-01T10:00:00.000Z"),
      stamp("a", "me", "2026-10-01T10:00:00.000Z"),
      stamp("c", "me", "2026-10-03T08:00:00Z"),
      stamp("d", "me", "nonsense"),
    ];
    expect(newestFirst(stamps).map((s) => s.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("leaves what it was given as it was", () => {
    const stamps = [
      stamp("a", "me", "2026-10-01T10:00:00Z"),
      stamp("b", "me", "2026-10-02T10:00:00Z"),
    ];
    newestFirst(stamps);
    expect(stamps.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("byPerson", () => {
  const card = (from: string | null, name: string): StampOrigin => ({
    kind: "card",
    from,
    name,
  });
  const gift: StampOrigin = { kind: "gift", from: null, name: "Boop" };

  it("has mine first, then each person by name, Boop's last", () => {
    const groups = byPerson(
      [
        stamp("gift", "me", "2026-10-05T00:00:00Z", gift),
        stamp("bo-shared", "bo", "2026-10-02T00:00:00Z"),
        stamp("mine-old", "me", "2026-09-01T00:00:00Z"),
        stamp("anna-card", "me", "2026-10-04T00:00:00Z", card("anna", "Anna")),
        stamp("mine-new", "me", "2026-10-03T00:00:00Z"),
        stamp("anna-shared", "anna", "2026-10-01T00:00:00Z"),
      ],
      "me",
      nameOf
    );
    expect(
      groups.map((g) => [g.kind, g.name, g.stamps.map((s) => s.id)])
    ).toEqual([
      ["mine", "", ["mine-new", "mine-old"]],
      ["person", "Anna Berg", ["anna-card", "anna-shared"]],
      ["person", "Bo", ["bo-shared"]],
      ["boop", "", ["gift"]],
    ]);
  });

  it("names a giver the device doesn't know by the card", () => {
    const groups = byPerson(
      [
        stamp("x", "me", "2026-10-01T00:00:00Z", card("stranger", "Cleo")),
        stamp("y", "me", "2026-10-02T00:00:00Z", card("stranger", "Cleo")),
      ],
      "me",
      nameOf
    );
    expect(groups.map((g) => [g.key, g.name, g.stamps.length])).toEqual([
      ["mine", "", 0],
      ["person:stranger", "Cleo", 2],
    ]);
  });

  it("keeps a giver who is gone by name – the nameless last", () => {
    const groups = byPerson(
      [
        stamp("gone", "me", "2026-10-01T00:00:00Z", card(null, "Zoe")),
        stamp("also", "me", "2026-10-02T00:00:00Z", card(null, " Zoe ")),
        stamp("blank", "me", "2026-10-03T00:00:00Z", card(null, "")),
        stamp("anna", "me", "2026-10-04T00:00:00Z", card("anna", "Anna")),
      ],
      "me",
      nameOf
    );
    expect(groups.map((g) => [g.name, g.stamps.map((s) => s.id)])).toEqual([
      ["", []],
      ["Anna Berg", ["anna"]],
      ["Zoe", ["also", "gone"]],
      ["", ["blank"]],
    ]);
    expect(groups.at(-1)?.kind).toBe("person");
  });

  it("files someone's shared stamp under them, whatever it came from", () => {
    const groups = byPerson(
      [stamp("s", "bo", "2026-10-01T00:00:00Z", card("anna", "Anna"))],
      "me",
      nameOf
    );
    expect(groups[1]).toMatchObject({ key: "person:bo", name: "Bo" });
  });

  it("leaves Boop out without gifts", () => {
    const groups = byPerson(
      [stamp("m", "me", "2026-10-01T00:00:00Z")],
      "me",
      nameOf
    );
    expect(groups.map((g) => g.kind)).toEqual(["mine"]);
  });
});

const colored = (id: string, color: string, changedAt: string) => ({
  ...stamp(id, "me", changedAt),
  color,
});

const print = (stamp: string, changedAt: string, placedBy = "me") => ({
  stamp,
  placedBy,
  changedAt,
});

describe("lastUsed", () => {
  it("keeps each stamp's latest print of mine", () => {
    const used = lastUsed(
      [
        print("a", "2026-10-01T10:00:00Z"),
        print("a", "2026-10-03T10:00:00Z"),
        print("a", "2026-10-02T10:00:00Z"),
        print("b", "2026-10-05T10:00:00Z", "anna"),
      ],
      "me"
    );
    expect([...used]).toEqual([["a", Date.parse("2026-10-03T10:00:00Z")]]);
  });

  it("leaves out what was printed after `until`", () => {
    const until = Date.parse("2026-10-02T00:00:00Z");
    const used = lastUsed(
      [
        print("a", "2026-10-01T10:00:00Z"),
        print("a", "2026-10-03T10:00:00Z"),
        print("b", "2026-10-04T10:00:00Z"),
      ],
      "me",
      until
    );
    expect([...used]).toEqual([["a", Date.parse("2026-10-01T10:00:00Z")]]);
  });
});

describe("recentFirst", () => {
  it("puts the last used first, a new one by when it came", () => {
    const stamps = [
      stamp("old-unused", "me", "2026-09-01T00:00:00Z"),
      stamp("used-long-ago", "me", "2026-08-01T00:00:00Z"),
      stamp("used-lately", "me", "2026-08-02T00:00:00Z"),
      stamp("brand-new", "me", "2026-10-10T00:00:00Z"),
    ];
    const used = lastUsed(
      [
        print("used-long-ago", "2026-08-15T00:00:00Z"),
        print("used-lately", "2026-10-05T00:00:00Z"),
      ],
      "me"
    );
    expect(recentFirst(stamps, used).map((s) => s.id)).toEqual([
      "brand-new",
      "used-lately",
      "old-unused",
      "used-long-ago",
    ]);
  });
});

describe("byColor", () => {
  it("goes by the palette, a color it lost after it – each newest first", () => {
    const stamps = [
      colored("sky-old", "sky", "2026-10-01T00:00:00Z"),
      colored("red", "red", "2026-10-02T00:00:00Z"),
      colored("gone", "plum", "2026-10-09T00:00:00Z"),
      colored("sky-new", "sky", "2026-10-05T00:00:00Z"),
      colored("also-gone", "lime", "2026-10-03T00:00:00Z"),
    ];
    expect(byColor(stamps, ["red", "sky"]).map((s) => s.id)).toEqual([
      "red",
      "sky-new",
      "sky-old",
      "also-gone",
      "gone",
    ]);
  });
});

describe("shelve", () => {
  const stamps = [
    colored("a", "sky", "2026-10-01T00:00:00Z"),
    colored("b", "red", "2026-10-02T00:00:00Z"),
    { ...colored("c", "red", "2026-10-03T00:00:00Z"), owner: "bo" },
  ];
  const options = {
    me: "me",
    nameOf,
    used: new Map([["a", Date.parse("2026-10-05T00:00:00Z")]]),
    colors: ["red", "sky"],
  };
  const ids = (order: Parameters<typeof shelve>[1]) =>
    shelve(stamps, order, options).map((g) => [
      g.key,
      g.stamps.map((s) => s.id),
    ]);

  it("has all in one section but by person", () => {
    expect(ids("recent")).toEqual([["all", ["a", "c", "b"]]]);
    expect(ids("newest")).toEqual([["all", ["c", "b", "a"]]]);
    expect(ids("color")).toEqual([["all", ["c", "b", "a"]]]);
    expect(ids("person")).toEqual([
      ["mine", ["b", "a"]],
      ["person:bo", ["c"]],
    ]);
  });
});
