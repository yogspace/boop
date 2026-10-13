import { describe, expect, it } from "vitest";
import {
  type StampDoc,
  sharedWithOf,
  stampDoc,
  stampsOf,
} from "../../src/features/calendar/model";

const ME = "me";
const ANNA = "anna";
const [HOME, FAMILY, CIRCUS, ELSEWHERE] = ["home", "family", "circus", "far"];

const stamp = (id: string, owner: string, sharedWith: string[] = []) =>
  ({
    id,
    name: id,
    color: "ink",
    shape: "circle",
    drawing: null,
    owner,
    sharedWith,
    changedAt: "2026-10-12T08:00:00.000Z",
    deleted: false,
  }) satisfies StampDoc;

const ids = (stamps: { id: string }[]) => stamps.map((s) => s.id);

describe("the stamps an account stamps with", () => {
  const mine = [HOME, FAMILY, CIRCUS];

  it("has its own – shared or not, whatever calendar is open", () => {
    const stamps = [
      stamp("private", ME),
      stamp("shared", ME, [FAMILY]),
      // Shared with a calendar that is gone from the device: still mine.
      stamp("stale", ME, [ELSEWHERE]),
    ];
    expect(ids(stampsOf(stamps, ME, mine))).toEqual([
      "private",
      "shared",
      "stale",
    ]);
    // Not a member of anything (yet) – they are mine all the same.
    expect(ids(stampsOf(stamps, ME, []))).toEqual([
      "private",
      "shared",
      "stale",
    ]);
  });

  it("has what others share with any calendar it is in", () => {
    const stamps = [
      stamp("family", ANNA, [FAMILY]),
      stamp("both", ANNA, [ELSEWHERE, CIRCUS]),
    ];
    expect(ids(stampsOf(stamps, ME, mine))).toEqual(["family", "both"]);
  });

  it("leaves out what others didn't share with it", () => {
    const stamps = [
      // Only placed in a shared calendar – here so its prints show.
      stamp("placed", ANNA),
      stamp("theirs", ANNA, [ELSEWHERE]),
    ];
    expect(stampsOf(stamps, ME, mine)).toEqual([]);
    // Shared with a calendar the account left.
    expect(stampsOf([stamp("left", ANNA, [FAMILY])], ME, [HOME])).toEqual([]);
  });

  it("puts its own first – each kind in the order it came", () => {
    const stamps = [
      stamp("a", ANNA, [FAMILY]),
      stamp("b", ME),
      stamp("c", ANNA, [CIRCUS]),
      stamp("d", ME, [FAMILY]),
      stamp("e", ANNA),
    ];
    expect(ids(stampsOf(stamps, ME, mine))).toEqual(["b", "d", "a", "c"]);
  });

  it("shows only what is shared while nobody is logged in", () => {
    const stamps = [stamp("a", ANNA, [FAMILY]), stamp("b", ME)];
    expect(ids(stampsOf(stamps, undefined, mine))).toEqual(["a"]);
  });
});

describe("a stamp's sharing, whatever shape it is in", () => {
  it("reads `sharedWith`", () => {
    expect(sharedWithOf({ sharedWith: [FAMILY, CIRCUS] })).toEqual([
      FAMILY,
      CIRCUS,
    ]);
    expect(sharedWithOf({ sharedWith: [] })).toEqual([]);
    expect(sharedWithOf({})).toEqual([]);
  });

  it("counts the one `calendar` of before as one more", () => {
    expect(sharedWithOf({ calendar: FAMILY })).toEqual([FAMILY]);
    expect(sharedWithOf({ calendar: null })).toEqual([]);
    expect(sharedWithOf({ sharedWith: [CIRCUS], calendar: FAMILY })).toEqual([
      CIRCUS,
      FAMILY,
    ]);
    expect(sharedWithOf({ sharedWith: null, calendar: FAMILY })).toEqual([
      FAMILY,
    ]);
  });

  it("names none twice", () => {
    expect(
      sharedWithOf({ sharedWith: [FAMILY, CIRCUS, FAMILY], calendar: CIRCUS })
    ).toEqual([FAMILY, CIRCUS]);
  });

  it("takes ids and the documents themselves, and drops junk", () => {
    expect(
      sharedWithOf({
        sharedWith: [{ id: FAMILY, name: "Family" }, CIRCUS, null, 7, ""],
        calendar: { id: HOME },
      })
    ).toEqual([FAMILY, CIRCUS, HOME]);
    expect(sharedWithOf({ sharedWith: "family" })).toEqual([]);
  });
});

describe("a stamp kept or sent in the shape of before", () => {
  const { sharedWith: _, ...bare } = stamp("old", ME);

  it("turns its `calendar` into `sharedWith` – and loses it", () => {
    const shared = stampDoc({ ...bare, calendar: FAMILY });
    expect(shared).toEqual(stamp("old", ME, [FAMILY]));
    expect("calendar" in shared).toBe(false);

    const personal = stampDoc({ ...bare, calendar: null });
    expect(personal).toEqual(stamp("old", ME));
    expect("calendar" in personal).toBe(false);
  });

  it("leaves today's shape as it is", () => {
    const today = stamp("new", ANNA, [FAMILY, CIRCUS]);
    expect(stampDoc(today)).toEqual(today);
    expect(stampDoc(bare)).toEqual(stamp("old", ME));
  });

  it("keeps where a stamp came from – and makes none up", () => {
    const origin = { kind: "card", from: ANNA, name: "Anna" } as const;
    expect(stampDoc({ ...stamp("taken", ME), origin }).origin).toEqual(origin);
    expect(stampDoc({ ...bare, calendar: FAMILY, origin }).origin).toEqual(
      origin
    );
    expect("origin" in stampDoc(stamp("drawn", ME))).toBe(false);
  });

  it("then shows in every calendar, as any stamp of mine", () => {
    const kept = [
      { ...bare, id: "mine", calendar: FAMILY },
      { ...bare, id: "annas", owner: ANNA, calendar: FAMILY },
      { ...bare, id: "private", owner: ANNA, calendar: null },
    ].map(stampDoc);
    expect(ids(stampsOf(kept, ME, [HOME, FAMILY]))).toEqual(["mine", "annas"]);
  });
});
