import { describe, expect, it } from "vitest";
import { byPerson, newestFirst } from "../../src/features/app/shelf";
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
