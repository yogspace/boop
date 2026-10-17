import type { PayloadRequest } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

// apply.ts speaks in the app's paths (@/…), which the tests don't resolve –
// the same modules, by their relative ones. Membership only lends `idOf`.
vi.mock(
  "@/features/calendar/model",
  () => import("../../src/features/calendar/model")
);
vi.mock(
  "@/features/calendar/note",
  () => import("../../src/features/calendar/note")
);
vi.mock(
  "@/features/calendar/palette",
  () => import("../../src/features/calendar/palette")
);
vi.mock(
  "@/features/calendar/prefs",
  () => import("../../src/features/calendar/prefs")
);
vi.mock("@/features/calendar/membership", () => ({
  idOf: (value: unknown) =>
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "id" in value
        ? String((value as { id: unknown }).id)
        : null,
}));

const { applyChange } = await import("../../src/features/sync/apply");

/**
 * A stamp drawn anew (store.ts, `updateStamp`), as the sync takes it: its
 * owner changes the look of one they drew – checked as when it was made –
 * and names and shares it. Nobody else touches it, and a copy (a card
 * taken, a gift) keeps the look of its original (cards/follow.ts).
 */

type Doc = Record<string, unknown>;

const ME = "acc-me";
const ANNA = "acc-anna";
const HOME = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const MINE = "22222222-3333-4444-8555-666666666666";
const COPY = "11111111-2222-4333-8444-555555555555";
const THEIRS = "33333333-4444-4555-8666-777777777777";
const DRAWING = { v: 1, strokes: [{ w: 0.05, p: [0.1, 0.1, 0.9, 0.9] }] };
/** A line with its anchors – drawn anew with the line tool. */
const LINED = {
  v: 1,
  strokes: [
    {
      w: 0.03,
      p: [0.2, 0.5, 0.8, 0.5],
      a: [0.2, 0.5, 0.2, 0.5, 0.2, 0.5, 0.8, 0.5, 0.8, 0.5, 0.8, 0.5],
    },
  ],
  rim: "wave",
  special: true,
  inverted: true,
};

/** The database, in memory – what apply.ts asks of Payload, and no more. */
const fake = () => {
  const db: Record<string, Map<string, Doc>> = { stamps: new Map() };
  const payload = {
    findByID: async ({ collection, id }: { collection: string; id: string }) =>
      db[collection].get(id) ?? null,
    create: async ({ collection, data }: { collection: string; data: Doc }) => {
      db[collection].set(String(data.id), { ...data });
      return data;
    },
    update: async ({
      collection,
      id,
      data,
    }: {
      collection: string;
      id?: string;
      data: Doc;
    }) => {
      if (!id) return { docs: [] };
      const doc = { ...db[collection].get(id), ...data };
      db[collection].set(id, doc);
      return doc;
    },
  };
  return { db, req: { payload } as unknown as PayloadRequest };
};

let db: ReturnType<typeof fake>["db"];
let req: PayloadRequest;
let minute = 0;

beforeEach(() => {
  ({ db, req } = fake());
  minute = 0;
  const stamp = {
    name: "Herz",
    color: "mint",
    shape: "circle",
    drawing: DRAWING,
    sharedWith: [],
    deleted: false,
  };
  db.stamps.set(MINE, { ...stamp, id: MINE, owner: ME });
  db.stamps.set(THEIRS, { ...stamp, id: THEIRS, owner: ANNA });
  // Anna's heart, taken from her card – mine now, a copy.
  db.stamps.set(COPY, {
    ...stamp,
    id: COPY,
    owner: ME,
    origin: { kind: "card", from: ANNA, name: "Anna", stamp: THEIRS },
  });
});

/** Each change a minute after the last – the later one wins. */
const at = () => new Date(Date.UTC(2026, 9, 16, 8, minute++)).toISOString();

const change = (
  id: string,
  data: Doc,
  { me = ME, admin = false }: { me?: string; admin?: boolean } = {}
) =>
  applyChange(
    {
      req,
      me,
      mine: new Set([HOME]),
      unshared: new Set<string>(),
      special: new Set(["gold", "glitter"]),
      admin,
      shapes: ["circle", "heart", "star"],
    },
    { type: "stamp", id, changedAt: at(), data }
  );

describe("a stamp drawn anew", () => {
  it("takes its owner's new look – drawing, rim and flags, shape, color – and name and sharing", async () => {
    expect(
      await change(MINE, {
        drawing: LINED,
        shape: "heart",
        color: "sky",
        name: "Welle",
        sharedWith: [HOME],
      })
    ).toEqual({ ok: true });
    const { drawing, ...rest } = db.stamps.get(MINE) as Doc & {
      drawing: typeof LINED;
    };
    // The line keeps its anchors – to be edited again; its points are
    // worked out from them anew.
    expect(drawing.strokes[0].a).toEqual(LINED.strokes[0].a);
    expect(drawing).toMatchObject({
      rim: "wave",
      special: true,
      inverted: true,
    });
    expect(rest).toMatchObject({
      shape: "heart",
      color: "sky",
      name: "Welle",
      sharedWith: [HOME],
      owner: ME,
    });
  });

  it("changes only what is sent", async () => {
    await change(MINE, { shape: "star" });
    expect(db.stamps.get(MINE)).toMatchObject({
      shape: "star",
      color: "mint",
      drawing: DRAWING,
      name: "Herz",
    });
  });

  it("is nobody's but its owner's", async () => {
    expect(await change(THEIRS, { drawing: LINED, color: "sky" })).toEqual({
      ok: false,
      reason: "not the owner",
    });
    expect(db.stamps.get(THEIRS)).toMatchObject({
      drawing: DRAWING,
      color: "mint",
    });
  });

  it("is checked as when it was made – what doesn't pass is left out", async () => {
    // No drawing left once checked: it keeps the one it has.
    await change(MINE, { drawing: { v: 1, strokes: "nope" }, name: "A" });
    await change(MINE, { drawing: { v: 1, strokes: [] }, name: "B" });
    expect(db.stamps.get(MINE)).toMatchObject({ drawing: DRAWING, name: "B" });
    // A shape neither the CMS nor the code has, a color that isn't public.
    await change(MINE, { shape: "blob", color: "gold" });
    expect(db.stamps.get(MINE)).toMatchObject({
      shape: "circle",
      color: "mint",
    });
    // Junk in a drawing goes, the rest is kept – trimmed like a new one.
    await change(MINE, {
      drawing: { ...DRAWING, rim: "lace", special: "yes", extra: 1 },
    });
    expect(db.stamps.get(MINE)?.drawing).toEqual(DRAWING);
  });

  it("wears a color that isn't public only for an account with the admin box", async () => {
    db.stamps.set(MINE, { ...db.stamps.get(MINE), owner: ANNA });
    await change(MINE, { color: "gold" }, { me: ANNA, admin: true });
    expect(db.stamps.get(MINE)?.color).toBe("gold");
  });
});

describe("a copy drawn anew", () => {
  it("is refused – it looks like its original", async () => {
    expect(await change(COPY, { drawing: LINED, color: "sky" })).toEqual({
      ok: false,
      reason: "a copy",
    });
    expect(await change(COPY, { shape: "heart" })).toMatchObject({
      ok: false,
    });
    expect(db.stamps.get(COPY)).toMatchObject({
      drawing: DRAWING,
      color: "mint",
      shape: "circle",
    });
  });

  it("is still named and shared by its owner – its look left out", async () => {
    expect(
      await change(COPY, {
        name: "Annas Herz",
        sharedWith: [HOME],
        drawing: LINED,
      })
    ).toEqual({ ok: true });
    expect(db.stamps.get(COPY)).toMatchObject({
      name: "Annas Herz",
      sharedWith: [HOME],
      drawing: DRAWING,
    });
  });
});

describe("a gift unwrapped", () => {
  const GIFT = "44444444-5555-4666-8777-888888888888";
  const wrapped = (more: Doc = {}) =>
    db.stamps.set(GIFT, {
      id: GIFT,
      name: "Kürbis",
      color: "gold",
      shape: "circle",
      drawing: DRAWING,
      owner: ME,
      sharedWith: [],
      origin: { kind: "gift", from: null, name: "Boop", gift: "gift-1" },
      wrapped: true,
      deleted: false,
      ...more,
    });

  it("is unwrapped by its owner – for good", async () => {
    wrapped();
    expect(await change(GIFT, { wrapped: false })).toEqual({ ok: true });
    expect(db.stamps.get(GIFT)?.wrapped).toBe(false);
    // A device never wraps one again.
    expect(await change(GIFT, { wrapped: true })).toEqual({ ok: true });
    expect(db.stamps.get(GIFT)?.wrapped).toBe(false);
  });

  it("counts even when the server's copy changed later – as a change made now", async () => {
    const later = Date.UTC(2026, 9, 16, 9);
    wrapped({ changedAt: new Date(later).toISOString() });
    expect(await change(GIFT, { wrapped: false })).toEqual({ ok: true });
    const stamp = db.stamps.get(GIFT) as Doc;
    expect(stamp.wrapped).toBe(false);
    expect(Date.parse(String(stamp.changedAt))).toBeGreaterThan(later);
  });

  it("is nobody's to unwrap but its owner's", async () => {
    wrapped({ owner: ANNA });
    expect(await change(GIFT, { wrapped: false })).toEqual({
      ok: false,
      reason: "not the owner",
    });
    expect(db.stamps.get(GIFT)?.wrapped).toBe(true);
  });

  it("is never wrapped by a device", async () => {
    expect(await change(MINE, { wrapped: true })).toEqual({ ok: true });
    expect(db.stamps.get(MINE)?.wrapped).toBeUndefined();
  });
});
