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
 * The colors that aren't public (palette.ts, `special`) – Boop's gifts'.
 * Who may wear them on what, as the sync decides it (apply.ts): an account
 * with the admin box on anything, everyone else only where the color came
 * with the thing.
 */

type Doc = Record<string, unknown>;

const ME = "acc-me";
const MAX = "acc-max";
const HOME = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const NEW = "9a8b7c6d-5e4f-4321-8765-0fedcba98765";
const GIFT = "11111111-2222-4333-8444-555555555555";
const PLAIN = "22222222-3333-4444-8555-666666666666";
const PRINT = "33333333-4444-4555-8666-777777777777";
const DAY = "2026-10-13";
const DRAWING = { v: 1, strokes: [{ w: 0.05, p: [0.1, 0.1, 0.9, 0.9] }] };

/** The database, in memory – what apply.ts asks of Payload, and no more. */
const fake = () => {
  const db: Record<string, Map<string, Doc>> = {
    calendars: new Map(),
    stamps: new Map(),
    placements: new Map(),
  };
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
    delete: async () => undefined,
    find: async () => ({ docs: [] }),
  };
  return { db, req: { payload } as unknown as PayloadRequest };
};

let db: ReturnType<typeof fake>["db"];
let req: PayloadRequest;
let minute = 0;

beforeEach(() => {
  ({ db, req } = fake());
  minute = 0;
  db.calendars.set(HOME, {
    id: HOME,
    name: "Zuhause",
    color: "sky",
    owner: ME,
    members: [ME, MAX],
    deleted: false,
  });
  // A gift from Boop, in gold – mine – and a stamp I drew myself.
  db.stamps.set(GIFT, {
    id: GIFT,
    name: "Kürbis",
    color: "gold",
    shape: "circle",
    drawing: DRAWING,
    owner: ME,
    origin: { kind: "gift", from: null, name: "Boop", gift: "gift-1" },
    deleted: false,
  });
  db.stamps.set(PLAIN, {
    id: PLAIN,
    name: "Herz",
    color: "mint",
    shape: "circle",
    drawing: DRAWING,
    owner: ME,
    deleted: false,
  });
});

const ctx = (me = ME, admin = false) => ({
  req,
  me,
  mine: new Set([HOME]),
  unshared: new Set<string>(),
  special: new Set(["gold", "glitter"]),
  admin,
});

/** Each change a minute after the last – the later one wins. */
const at = () => new Date(Date.UTC(2026, 9, 13, 8, minute++)).toISOString();

const change = (
  type: "calendar" | "stamp" | "placement",
  id: string,
  data: Doc,
  who: { me?: string; admin?: boolean } = {}
) => applyChange(ctx(who.me, who.admin), { type, id, changedAt: at(), data });

const print = (data: Doc, who?: { me?: string; admin?: boolean }, id = PRINT) =>
  change(
    "placement",
    id,
    { calendar: HOME, date: DAY, x: 0.5, y: 0.5, ...data },
    who
  );

describe("a color that isn't public, on a stamp", () => {
  it("is not for a stamp anyone draws – the rest of it still counts", async () => {
    expect(
      await change("stamp", NEW, {
        name: "Stern",
        color: "gold",
        shape: "square",
        drawing: DRAWING,
      })
    ).toEqual({ ok: true });
    const stamp = db.stamps.get(NEW);
    expect(stamp).toMatchObject({ name: "Stern", shape: "square", owner: ME });
    // Left out: the collection's default takes its place.
    expect(stamp && "color" in stamp).toBe(false);
  });

  it("is for an account with the admin box – to draw Boop's gifts in", async () => {
    await change(
      "stamp",
      NEW,
      { name: "Stern", color: "gold", drawing: DRAWING },
      { me: MAX, admin: true }
    );
    expect(db.stamps.get(NEW)).toMatchObject({ color: "gold", owner: MAX });
  });

  it("stays on a stamp that came with it – renamed, shared, whatever", async () => {
    await change("stamp", GIFT, { name: "Mein Kürbis", sharedWith: [HOME] });
    expect(db.stamps.get(GIFT)).toMatchObject({
      name: "Mein Kürbis",
      color: "gold",
      sharedWith: [HOME],
    });
    // Sent along as it is: fine. Another special one: not that.
    await change("stamp", GIFT, { color: "gold", name: "Gold" });
    expect(db.stamps.get(GIFT)).toMatchObject({ color: "gold", name: "Gold" });
    await change("stamp", GIFT, { color: "glitter", name: "Glitzer" });
    expect(db.stamps.get(GIFT)).toMatchObject({
      color: "gold",
      name: "Glitzer",
    });
  });

  it("can't be put on a stamp one drew, later on", async () => {
    await change("stamp", PLAIN, { color: "gold" });
    expect(db.stamps.get(PLAIN)?.color).toBe("mint");
    await change("stamp", PLAIN, { color: "sky" });
    expect(db.stamps.get(PLAIN)?.color).toBe("sky");
  });

  it("never comes with an origin a device made up", async () => {
    await change("stamp", NEW, {
      name: "Stern",
      color: "mint",
      drawing: DRAWING,
      origin: { kind: "gift", from: null, name: "Boop" },
    });
    expect(db.stamps.get(NEW)?.origin).toBeUndefined();
    await change("stamp", PLAIN, { origin: { kind: "gift", name: "Boop" } });
    expect(db.stamps.get(PLAIN)?.origin).toBeUndefined();
  });

  it("leaves a deleted copy knowing which gift it was – not whose words", async () => {
    db.stamps.set(GIFT, {
      ...db.stamps.get(GIFT),
      origin: {
        kind: "card",
        from: MAX,
        name: "Max",
        message: "Für dich!",
        card: "AbCd1234EfGh",
      },
    });
    await applyChange(ctx(), {
      type: "stamp",
      id: GIFT,
      changedAt: at(),
      deleted: true,
    });
    expect(db.stamps.get(GIFT)).toMatchObject({
      deleted: true,
      name: "",
      drawing: null,
      origin: {
        kind: "card",
        from: null,
        name: "",
        message: "",
        card: "AbCd1234EfGh",
      },
    });
  });
});

describe("a color that isn't public, as a print's ink", () => {
  it("is the stamp's own ink – a gift prints in its color", async () => {
    expect(await print({ stamp: GIFT, ink: "gold" })).toEqual({ ok: true });
    expect(db.placements.get(PRINT)).toMatchObject({
      stamp: GIFT,
      ink: "gold",
      placedBy: ME,
    });
  });

  it("is no ink pad for any other stamp – the print comes in the stamp's own", async () => {
    expect(await print({ stamp: PLAIN, ink: "gold" })).toEqual({ ok: true });
    const placed = db.placements.get(PRINT);
    expect(placed).toMatchObject({ stamp: PLAIN, x: 0.5 });
    // No ink kept: the stamp's color shows (model.ts, `PlacementDoc.ink`).
    expect(placed && "ink" in placed).toBe(false);
  });

  it("is not the gift's ink either when it is another special color", async () => {
    await print({ stamp: GIFT, ink: "glitter" });
    const placed = db.placements.get(PRINT);
    expect(placed && "ink" in placed).toBe(false);
  });

  it("lets a gift be stamped in any public ink, like every stamp", async () => {
    await print({ stamp: GIFT, ink: "mint" });
    expect(db.placements.get(PRINT)?.ink).toBe("mint");
  });

  it("is any stamp's ink for an account with the admin box", async () => {
    db.stamps.set(PLAIN, { ...db.stamps.get(PLAIN), owner: MAX });
    await print({ stamp: PLAIN, ink: "glitter" }, { me: MAX, admin: true });
    expect(db.placements.get(PRINT)).toMatchObject({
      ink: "glitter",
      placedBy: MAX,
    });
  });

  it("can't be dipped into afterwards – a print keeps its ink", async () => {
    await print({ stamp: PLAIN, ink: "mint" });
    await change("placement", PRINT, { ink: "gold", x: 0.2 });
    expect(db.placements.get(PRINT)).toMatchObject({ ink: "mint", x: 0.2 });
    // The gift's print may be told its own ink again.
    const other = "44444444-5555-4666-8777-888888888888";
    await print({ stamp: GIFT, ink: "mint" }, undefined, other);
    await change("placement", other, { ink: "gold" });
    expect(db.placements.get(other)?.ink).toBe("gold");
  });
});

describe("a color that isn't public, on a calendar", () => {
  it("is not for a calendar – new or changed – unless the admin box is ticked", async () => {
    await change("calendar", NEW, { name: "Gold", color: "gold" });
    const made = db.calendars.get(NEW);
    expect(made).toMatchObject({ name: "Gold", owner: ME });
    expect(made && "color" in made).toBe(false);

    await change("calendar", HOME, { color: "glitter", name: "Daheim" });
    expect(db.calendars.get(HOME)).toMatchObject({
      color: "sky",
      name: "Daheim",
    });

    db.calendars.set(HOME, { ...db.calendars.get(HOME), owner: MAX });
    await change(
      "calendar",
      HOME,
      { color: "glitter" },
      { me: MAX, admin: true }
    );
    expect(db.calendars.get(HOME)?.color).toBe("glitter");
  });
});

describe("colors while the sync knows of no special ones", () => {
  it("are taken by their form alone, as ever", async () => {
    const plain = {
      req,
      me: ME,
      mine: new Set([HOME]),
      unshared: new Set<string>(),
    };
    await applyChange(plain, {
      type: "stamp",
      id: NEW,
      changedAt: at(),
      data: { name: "Stern", color: "gold", drawing: DRAWING },
    });
    expect(db.stamps.get(NEW)?.color).toBe("gold");
    await applyChange(plain, {
      type: "stamp",
      id: NEW,
      changedAt: at(),
      data: { color: "Not A Key" },
    });
    expect(db.stamps.get(NEW)?.color).toBe("gold");
  });
});
