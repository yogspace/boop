import type { PayloadRequest } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDatabase } from "../calendar/fake-database";

/**
 * A stamp drawn anew, and what was made of it follows (cards/follow.ts):
 * its copies – a card taken, a gift from Boop –, its cards and its gifts
 * take over its new look; names stay, deleted copies stay as they are. And
 * the sync brings the new look to whoever has its prints (sync/pull.ts).
 */

// What happens beside the database – noted here.
const beside = vi.hoisted(() => ({ nudged: [] as string[][] }));

// The app's paths (@/…), which the tests don't resolve – each by its file,
// through one door (test/access has the why).
const sources = import.meta.glob(["../../src/**/*.ts", "../../src/**/*.tsx"]);
for (const file of Object.keys(sources)) {
  let module: Record<PropertyKey, unknown> | undefined;
  let loading = false;
  const live = new Proxy(
    {},
    {
      get: (_, key) => (key === "then" ? undefined : module?.[key]),
      has: (_, key) => !module || key in module,
    }
  );
  const door = async () => {
    if (module) return module;
    if (loading) return live;
    loading = true;
    module = await vi.importActual<Record<PropertyKey, unknown>>(file);
    return module;
  };
  const alias = file.replace("../../src/", "@/").replace(/\.tsx?$/, "");
  vi.doMock(file, door);
  vi.doMock(alias, door);
  if (alias.endsWith("/index")) vi.doMock(alias.slice(0, -6), door);
}
vi.doMock("@payload-config", () => ({ default: {} }));
vi.doMock("@/features/sync/live", () => ({
  nudge: (accounts: Iterable<string>) => {
    beside.nudged.push([...accounts]);
  },
  nudgeCalendars: async () => undefined,
  liveEndpoint: {},
}));

const { follow, followOriginal, lookChange } = await import(
  "../../src/features/cards/follow"
);
const { pull } = await import("../../src/features/sync/pull");

type Doc = Record<string, unknown>;

const START = Date.parse("2026-10-16T10:00:00.000Z");
const MINUTE = 60_000;
const ANNA = "acc-anna";
const BEN = "acc-ben";
const CARL = "acc-carl";
const DORA = "acc-dora";
const ERIK = "acc-erik";
const HEART = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const FAMILY = "11111111-2222-4333-8444-555555555555";
const DRAWING = { v: 1, strokes: [{ w: 0.05, p: [0.1, 0.1, 0.9, 0.9] }] };
const ANEW = {
  v: 1,
  strokes: [{ w: 0.03, p: [0.2, 0.5, 0.8, 0.5] }],
  rim: "wave",
  special: true,
};

let fake: ReturnType<typeof fakeDatabase>;

/** A copy of Anna's heart – a card's or a gift's. */
const copy = (id: string, owner: string, doc: Doc = {}) =>
  fake.put("stamps", {
    id,
    name: "Herz",
    color: "sky",
    shape: "heart",
    drawing: DRAWING,
    owner,
    sharedWith: [],
    origin: {
      kind: "card",
      from: ANNA,
      name: "Anna",
      card: "Card",
      stamp: HEART,
    },
    changedAt: new Date(START).toISOString(),
    deleted: false,
    ...doc,
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: START });
  fake = fakeDatabase();
  // The sync reads the accounts' own settings too (calendar/prefs.ts).
  fake.db["calendar-prefs"] ??= new Map();
  beside.nudged.length = 0;
  // Anna drew a heart, sky blue – and sent it as a card; Boop gave it away
  // twice: once in a gold of its own, once in its own color.
  fake.put("stamps", {
    id: HEART,
    name: "Herz",
    color: "sky",
    shape: "heart",
    drawing: DRAWING,
    owner: ANNA,
    sharedWith: [],
    deleted: false,
  });
  fake.put("cards", {
    id: "CardAbCd1234",
    stamp: HEART,
    from: ANNA,
    name: "Herz",
    color: "sky",
    shape: "heart",
    drawing: DRAWING,
  });
  fake.put("gifts", {
    id: "gift-gold",
    stamp: HEART,
    name: { de: "Goldherz", en: "Gold heart" },
    color: "gold",
    shape: "heart",
    drawing: DRAWING,
  });
  fake.put("gifts", {
    id: "gift-sky",
    stamp: HEART,
    name: { de: "Herz", en: "Heart" },
    color: "sky",
    shape: "heart",
    drawing: DRAWING,
  });
  // Ben took the card and named his copy; Carl took it and deleted it.
  copy("copy-ben", BEN, { name: "Bens Herz", sharedWith: [FAMILY] });
  copy("copy-carl", CARL, { name: "", drawing: null, deleted: true });
  const gift = (gift: string) => ({
    kind: "gift",
    from: null,
    name: "Boop",
    gift,
    stamp: HEART,
  });
  copy("copy-dora", DORA, { color: "gold", origin: gift("gift-gold") });
  copy("copy-erik", ERIK, { origin: gift("gift-sky") });
  // Someone else's heart, drawn by themselves – not Anna's.
  copy("other", ERIK, { origin: undefined });
});

afterEach(() => {
  vi.useRealTimers();
});

const later = (minutes = 1) => vi.setSystemTime(Date.now() + minutes * MINUTE);

const change = {
  look: { drawing: ANEW as never, color: "pink" },
  before: { color: "sky" },
};

describe("what changed of a stamp's look", () => {
  const heart = { color: "sky", shape: "heart", drawing: DRAWING };

  it("is its drawing, shape, color – only those that did", () => {
    expect(lookChange(heart, { ...heart, drawing: ANEW })).toEqual({
      look: { drawing: ANEW },
      before: { color: "sky" },
    });
    expect(
      lookChange(heart, { ...heart, shape: "star", color: "mint", name: "X" })
    ).toEqual({
      look: { shape: "star", color: "mint" },
      before: { color: "sky" },
    });
  });

  it("is nothing for a new name or sharing, a copy, a stamp deleted", () => {
    expect(
      lookChange(heart, { ...heart, name: "Neu", sharedWith: [FAMILY] })
    ).toBeNull();
    const origin = { kind: "card", stamp: HEART };
    expect(lookChange(heart, { ...heart, color: "mint", origin })).toBeNull();
    expect(
      lookChange(heart, { ...heart, drawing: null, deleted: true })
    ).toBeNull();
  });
});

describe("an original drawn anew", () => {
  it("reaches every copy not deleted – its look, never its name", async () => {
    later();
    expect(await follow(fake.payload, HEART, change)).toEqual({
      cards: 1,
      gifts: 2,
      copies: 3,
    });
    expect(fake.get("stamps", "copy-ben")).toMatchObject({
      name: "Bens Herz",
      sharedWith: [FAMILY],
      drawing: ANEW,
      color: "pink",
      shape: "heart",
      // Changed now: its owner's devices take it over.
      changedAt: new Date(START + MINUTE).toISOString(),
    });
    expect(fake.get("stamps", "copy-carl")).toMatchObject({
      deleted: true,
      drawing: null,
      color: "sky",
    });
    expect(fake.get("stamps", "other")?.drawing).toEqual(DRAWING);
    // Their owners' open apps hear of it – not Carl, not Anna.
    expect(beside.nudged.flat().sort()).toEqual([BEN, DORA, ERIK]);
  });

  it("reaches its cards – their page shows the new look, the name of then", async () => {
    await follow(fake.payload, HEART, change);
    expect(fake.get("cards", "CardAbCd1234")).toMatchObject({
      name: "Herz",
      drawing: ANEW,
      color: "pink",
      shape: "heart",
    });
  });

  it("reaches its gifts – a color of their own stays theirs, and their copies'", async () => {
    await follow(fake.payload, HEART, change);
    expect(fake.get("gifts", "gift-gold")).toMatchObject({
      name: { de: "Goldherz", en: "Gold heart" },
      drawing: ANEW,
      color: "gold",
    });
    expect(fake.get("gifts", "gift-sky")).toMatchObject({
      drawing: ANEW,
      color: "pink",
    });
    expect(fake.get("stamps", "copy-dora")).toMatchObject({
      drawing: ANEW,
      color: "gold",
    });
    expect(fake.get("stamps", "copy-erik")).toMatchObject({
      drawing: ANEW,
      color: "pink",
    });
  });

  it("takes only what changed – a new shape leaves the colors alone", async () => {
    await follow(fake.payload, HEART, {
      look: { shape: "star" },
      before: { color: "sky" },
    });
    expect(fake.get("stamps", "copy-dora")).toMatchObject({
      shape: "star",
      color: "gold",
      drawing: DRAWING,
    });
    expect(fake.get("cards", "CardAbCd1234")).toMatchObject({
      shape: "star",
      color: "sky",
    });
  });

  it("goes in portions – each one's owners nudged as it is done", async () => {
    await follow(fake.payload, HEART, change, { portion: 1 });
    for (const id of ["copy-ben", "copy-dora", "copy-erik"]) {
      expect(fake.get("stamps", id)?.drawing).toEqual(ANEW);
    }
    expect(beside.nudged.filter((owners) => owners.length)).toEqual([
      [BEN],
      [DORA],
      [ERIK],
    ]);
  });
});

describe("the stamps' hook", () => {
  const req = () => ({ payload: fake.payload }) as unknown as PayloadRequest;
  const heart = () => fake.get("stamps", HEART) as Doc;
  const hook = (doc: Doc, previousDoc: Doc, operation = "update") =>
    followOriginal({
      doc,
      previousDoc,
      operation,
      req: req(),
      collection: {} as never,
      context: {},
    } as never);

  it("passes an original's new look on, in the background", async () => {
    const after = { ...heart(), drawing: ANEW };
    expect(hook(after, heart())).toBe(after);
    await vi.waitFor(() =>
      expect(fake.get("stamps", "copy-ben")?.drawing).toEqual(ANEW)
    );
  });

  it("does nothing for a new stamp, a copy, or a new name", async () => {
    const ben = fake.get("stamps", "copy-ben") as Doc;
    hook({ ...heart(), drawing: ANEW }, {}, "create");
    hook({ ...ben, drawing: ANEW }, ben);
    hook({ ...heart(), name: "Mein Herz" }, heart());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fake.updates).toEqual([]);
  });
});

describe("the sync, after a stamp was drawn anew", () => {
  const synced = (as: string, since: string) =>
    pull({ payload: fake.payload } as unknown as PayloadRequest, as, {
      since,
      known: [FAMILY],
      need: [],
      touched: {
        calendar: new Set(),
        stamp: new Set(),
        placement: new Set(),
        note: new Set(),
        pref: new Set(),
      } as never,
    });

  beforeEach(() => {
    for (const id of [ANNA, BEN]) {
      fake.account({
        id,
        name: id === ANNA ? "Anna" : "Ben",
        email: `${id}@x.de`,
      });
    }
    const then = new Date(START).toISOString();
    fake.put("calendars", {
      id: FAMILY,
      name: "Familie",
      color: "sky",
      owner: ANNA,
      members: [ANNA, BEN],
      deleted: false,
      updatedAt: then,
    });
    // Anna stamped her heart in the family's calendar – shared with nobody.
    fake.put("placements", {
      id: "print-1",
      calendar: FAMILY,
      date: "2026-10-16",
      stamp: HEART,
      placedBy: ANNA,
      deleted: false,
      updatedAt: then,
    });
  });

  it("brings its new look to whoever has its prints", async () => {
    later(10);
    const since = new Date().toISOString();
    later(10);
    await fake.payload.update({
      collection: "stamps",
      id: HEART,
      data: { drawing: ANEW },
    });
    const { stamps } = await synced(BEN, since);
    expect(stamps.map((stamp) => stamp.id)).toContain(HEART);
    expect(stamps.find((stamp) => stamp.id === HEART)?.drawing).toEqual(ANEW);
  });

  it("brings nothing of a changed stamp printed nowhere of theirs", async () => {
    later(10);
    const since = new Date().toISOString();
    later(10);
    await fake.payload.update({
      collection: "stamps",
      id: "other",
      data: { drawing: ANEW },
    });
    const { stamps } = await synced(BEN, since);
    expect(stamps.map((stamp) => stamp.id)).not.toContain("other");
  });
});
