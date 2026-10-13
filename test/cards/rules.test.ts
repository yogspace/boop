import { describe, expect, it } from "vitest";
import { CARD_ID, MESSAGE_MAX } from "../../src/features/cards/protocol";
import {
  cardIdOf,
  cardStampOf,
  cleanMessage,
  newCardId,
  originOf,
} from "../../src/features/cards/rules";

describe("a card's id", () => {
  it("is twelve letters and digits – another one every time", () => {
    const ids = Array.from({ length: 200 }, newCardId);
    for (const id of ids) expect(id).toMatch(CARD_ID);
    expect(new Set(ids).size).toBe(200);
  });

  it("is read from the id itself, or from the card's link", () => {
    expect(cardIdOf("AbCd1234EfGh")).toBe("AbCd1234EfGh");
    expect(cardIdOf("  AbCd1234EfGh\n")).toBe("AbCd1234EfGh");
    expect(cardIdOf("https://boop.example/de/card/AbCd1234EfGh")).toBe(
      "AbCd1234EfGh"
    );
    expect(cardIdOf("https://boop.example/en/card/AbCd1234EfGh/?x=1#top")).toBe(
      "AbCd1234EfGh"
    );
    expect(cardIdOf("/de/card/AbCd1234EfGh")).toBe("AbCd1234EfGh");
  });

  it("is none in anything else", () => {
    for (const junk of [
      "",
      "AbCd1234EfG",
      "AbCd1234EfGhi",
      "AbCd-234EfGh",
      "https://boop.example/de/app/AbCd1234EfGh",
      "https://boop.example/de/card/AbCd1234EfGhXX",
      null,
      12,
    ]) {
      expect(cardIdOf(junk), String(junk)).toBeNull();
    }
  });
});

describe("a card's few words", () => {
  it("are kept as written – trimmed, line by line", () => {
    expect(cleanMessage("  Alles Gute!  ")).toBe("Alles Gute!");
    expect(cleanMessage("Für  dich \r\n  von mir")).toBe("Für dich\nvon mir");
    expect(cleanMessage("eins\n\n\n\n\nzwei")).toBe("eins\n\nzwei");
  });

  it("lose what is no text", () => {
    expect(cleanMessage("a\u0000b\u0007c\td")).toBe("a b c d");
    expect(cleanMessage("a\u2028b")).toBe("a b");
    expect(cleanMessage(null)).toBe("");
    expect(cleanMessage({ text: "x" })).toBe("");
    expect(cleanMessage(" \n \n ")).toBe("");
  });

  it("are cut at the limit – between characters, never inside one", () => {
    expect(cleanMessage("x".repeat(MESSAGE_MAX + 50))).toHaveLength(
      MESSAGE_MAX
    );
    const hearts = cleanMessage("💛".repeat(MESSAGE_MAX + 5));
    expect([...hearts]).toHaveLength(MESSAGE_MAX);
    expect(hearts.endsWith("💛")).toBe(true);
  });
});

describe("where a stamp came from", () => {
  const card = {
    kind: "card",
    from: { id: "acc-anna" },
    name: "Anna",
    message: "Für dich!",
    card: "AbCd1234EfGh",
    gift: null,
  };
  const gift = {
    kind: "gift",
    from: null,
    name: "Boop",
    message: "Frohes Stempeln!",
    card: null,
    gift: "gift-1",
  };

  it("is nowhere for a stamp its owner drew", () => {
    expect(originOf(undefined)).toBeUndefined();
    expect(originOf(null)).toBeUndefined();
    // A group nothing was ever written into.
    expect(originOf({})).toBeUndefined();
    expect(originOf({ kind: null, name: "Anna" })).toBeUndefined();
    expect(originOf({ kind: "theft", name: "Anna" })).toBeUndefined();
  });

  it("names the giver and their words – never the card or the gift", () => {
    expect(originOf(card)).toEqual({
      kind: "card",
      from: "acc-anna",
      name: "Anna",
      message: "Für dich!",
    });
    expect(originOf(gift)).toEqual({
      kind: "gift",
      from: null,
      name: "Boop",
      message: "Frohes Stempeln!",
    });
    // No words: none.
    expect(originOf({ ...card, from: "acc-anna", message: "" })).toEqual({
      kind: "card",
      from: "acc-anna",
      name: "Anna",
    });
  });

  it("is Boop for a gift, whatever is kept – and nobody once the giver is gone", () => {
    expect(originOf({ kind: "gift", from: "acc-x", name: "" })).toEqual({
      kind: "gift",
      from: null,
      name: "Boop",
    });
    expect(originOf({ ...card, from: null, name: "" })).toEqual({
      kind: "card",
      from: null,
      name: "",
      message: "Für dich!",
    });
  });

  it("says of someone else's stamp only that it came from somewhere", () => {
    expect(originOf(card, false)).toEqual({
      kind: "card",
      from: null,
      name: "",
    });
    expect(originOf(gift, false)).toEqual({
      kind: "gift",
      from: null,
      name: "Boop",
    });
    // As the sync hands it on: already an origin, cut down once more.
    expect(originOf(originOf(card), false)).toEqual({
      kind: "card",
      from: null,
      name: "",
    });
  });
});

describe("a stamp's look, for a card or a copy", () => {
  it("is its name, color, shape and drawing – checked", () => {
    const drawing = { v: 1, strokes: [{ w: 0.05, p: [0.1, 0.1, 0.9, 0.9] }] };
    expect(
      cardStampOf({
        id: "x",
        owner: "acc-anna",
        name: "Herz",
        color: "gold",
        shape: "diamond",
        drawing,
        sharedWith: ["cal"],
      })
    ).toEqual({ name: "Herz", color: "gold", shape: "diamond", drawing });
    expect(cardStampOf({ color: "Not A Key", shape: "blob" })).toEqual({
      name: "",
      color: "red",
      shape: "circle",
      drawing: null,
    });
  });
});
