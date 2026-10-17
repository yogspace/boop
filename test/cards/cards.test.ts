import type {
  CollectionConfig,
  Endpoint,
  Payload,
  PayloadRequest,
} from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDatabase } from "../calendar/fake-database";

/**
 * Cards and gifts against a database in memory: a card made, looked at,
 * taken and taken back through its endpoints (cards.ts), what goes when a
 * stamp or the giver's account goes, and a gift from Boop sent to everyone
 * (gifts.ts) – with the sync's reading of what came of it (sync/pull.ts).
 */

// What happens beside the database – noted here.
const beside = vi.hoisted(() => ({
  nudged: [] as string[],
  gifted: [] as { gift: string; name: unknown; accounts: string[] }[],
}));

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
    beside.nudged.push(...accounts);
  },
  nudgeCalendars: async () => undefined,
  liveEndpoint: {},
}));
vi.doMock("@/features/push/gifted", () => ({
  notifyGifted: async (
    _: unknown,
    told: { gift: string; name: unknown; accounts: string[] }
  ) => {
    beside.gifted.push({ ...told, accounts: [...told.accounts] });
  },
}));

const { Cards, dropCards } = await import("../../src/features/cards/cards");
const { Gifts, sendGift } = await import("../../src/features/cards/gifts");
const { Accounts } = await import("../../src/features/accounts/collection");
const { pull } = await import("../../src/features/sync/pull");
const { CARD_ID, MESSAGE_MAX } = await import(
  "../../src/features/cards/protocol"
);

type Doc = Record<string, unknown>;

const START = Date.parse("2026-10-13T10:00:00.000Z");
const MINUTE = 60_000;
const HEART = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const STAR = "9a8b7c6d-5e4f-4321-8765-0fedcba98765";
const FAMILY = "11111111-2222-4333-8444-555555555555";
const DRAWING = { v: 1, strokes: [{ w: 0.05, p: [0.1, 0.1, 0.9, 0.9] }] };

let fake: ReturnType<typeof fakeDatabase>;
// The brake on cards counts per account, for as long as the server runs:
// every test gets accounts of its own.
let run = 0;
let ANNA = "";
let BEN = "";
let CARL = "";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: START });
  run++;
  ANNA = `acc-anna-${run}`;
  BEN = `acc-ben-${run}`;
  CARL = `acc-carl-${run}`;
  fake = fakeDatabase();
  fake.account({ id: ANNA, name: "Anna", email: "anna@example.com" });
  fake.account({
    id: BEN,
    name: "Ben",
    email: "ben@example.com",
    locale: "en",
  });
  fake.account({ id: CARL, name: "Carl", email: "carl@example.com" });
  // Anna drew a heart – in gold, as only an admin's account can.
  fake.put("stamps", {
    id: HEART,
    name: "Herz",
    color: "gold",
    shape: "diamond",
    drawing: DRAWING,
    owner: ANNA,
    sharedWith: [],
    deleted: false,
  });
  beside.nudged.length = 0;
  beside.gifted.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

const later = (minutes = 1) => vi.setSystemTime(Date.now() + minutes * MINUTE);

type Answer = { status: number; body: Record<string, unknown> };

const request = (as?: string, user: unknown = null) => {
  const account = as ? fake.get("accounts", as) : null;
  return {
    payload: fake.payload,
    headers: new Headers(),
    // Where `sessionAccount` keeps whom it found for the request.
    context: {
      sessionAccount: account ? { ...account, collection: "accounts" } : null,
    },
    user,
  };
};

/** Calls an endpoint – logged in as `as` (an account's id), or as nobody. */
const call = async (
  collection: CollectionConfig,
  method: string,
  path: string,
  {
    as,
    user,
    params = {},
    body = {},
  }: {
    as?: string;
    user?: unknown;
    params?: Record<string, string>;
    body?: unknown;
  } = {}
): Promise<Answer> => {
  const endpoint = (collection.endpoints as Endpoint[]).find(
    (one) => one.path === path && one.method === method
  );
  if (!endpoint) throw new Error("No such endpoint.");
  const response = await endpoint.handler({
    ...request(as, user),
    routeParams: params,
    json: async () => body,
  } as unknown as PayloadRequest);
  return { status: response.status, body: await response.json() };
};

const send = (as: string | undefined, stamp: string, message = "") =>
  call(Cards, "post", "/", { as, body: { stamp, message } });

/** A card of Anna's heart – its id. */
const card = async (message = "Für dich!") =>
  String((await send(ANNA, HEART, message)).body.id);

const look = (id: string, as?: string) =>
  call(Cards, "get", "/:id", { as, params: { id } });

const take = (id: string, as?: string) =>
  call(Cards, "post", "/:id/take", { as, params: { id } });

const sent = async (as?: string) =>
  call(Cards, "get", "/", { as }) as Promise<
    Answer & { body: { cards: Doc[] } }
  >;

const takeBack = (id: string, as?: string) =>
  call(Cards, "delete", "/:id", { as, params: { id } });

const stampsOf = (owner: string) =>
  [...fake.db.stamps.values()].filter((stamp) => stamp.owner === owner);

/** What a first sync of the account brings. */
const synced = (as: string) =>
  pull({ payload: fake.payload } as unknown as PayloadRequest, as, {
    since: null,
    known: [],
    need: [],
    touched: {
      calendar: new Set(),
      stamp: new Set(),
      placement: new Set(),
      note: new Set(),
      pref: new Set(),
    },
  });

describe("sending a stamp as a card", () => {
  it("makes a card of one's own stamp – as it is now, with a few words", async () => {
    const answer = await send(ANNA, HEART, "  Alles  Gute!\n\n\n\nAnna ");
    expect(answer.status).toBe(200);
    const id = String(answer.body.id);
    expect(id).toMatch(CARD_ID);
    expect(fake.get("cards", id)).toMatchObject({
      stamp: HEART,
      from: ANNA,
      name: "Herz",
      color: "gold",
      shape: "diamond",
      drawing: DRAWING,
      message: "Alles Gute!\n\nAnna",
    });
  });

  it("keeps at most a few words", async () => {
    const id = String(
      (await send(ANNA, HEART, "x".repeat(MESSAGE_MAX + 100))).body.id
    );
    expect(String(fake.get("cards", id)?.message)).toHaveLength(MESSAGE_MAX);
  });

  it("is for whoever is logged in", async () => {
    expect((await send(undefined, HEART)).status).toBe(401);
    expect(fake.db.cards.size).toBe(0);
  });

  it("makes none of someone else's stamp, a deleted one, or none at all", async () => {
    expect((await send(BEN, HEART)).status).toBe(404);
    fake.put("stamps", { id: STAR, owner: ANNA, name: "", deleted: true });
    expect((await send(ANNA, STAR)).status).toBe(404);
    expect((await send(ANNA, "not-an-id")).status).toBe(404);
    expect((await send(ANNA, FAMILY)).status).toBe(404);
    expect(fake.db.cards.size).toBe(0);
  });

  it("doesn't pass on a stamp that came from someone – a card, a gift", async () => {
    const taken = String((await take(await card(), BEN)).body.stamp);
    expect((await send(BEN, taken)).status).toBe(403);
    fake.put("stamps", {
      id: STAR,
      owner: BEN,
      name: "Stern",
      color: "gold",
      origin: { kind: "gift", from: null, name: "Boop", gift: "gift-1" },
      deleted: false,
    });
    expect((await send(BEN, STAR)).status).toBe(403);
    expect(fake.db.cards.size).toBe(1);
  });

  it("slows down who makes them by the dozen – thirty an hour", async () => {
    for (let n = 0; n < 30; n++) {
      expect((await send(ANNA, HEART)).status).toBe(200);
    }
    expect((await send(ANNA, HEART)).status).toBe(429);
    expect(fake.db.cards.size).toBe(30);
    // Somebody else's are their own – and an hour on, hers go again.
    fake.put("stamps", { id: STAR, owner: BEN, name: "Stern", deleted: false });
    expect((await send(BEN, STAR)).status).toBe(200);
    later(61);
    expect((await send(ANNA, HEART)).status).toBe(200);
  });
});

describe("a card's page", () => {
  it("shows anyone with the link the stamp, the giver's name and the words", async () => {
    const id = await card();
    expect(await look(id)).toEqual({
      status: 200,
      body: {
        id,
        stamp: {
          name: "Herz",
          color: "gold",
          shape: "diamond",
          drawing: DRAWING,
        },
        message: "Für dich!",
        from: "Anna",
        createdAt: new Date(START).toISOString(),
      },
    });
  });

  it("shows the stamp as it was – whatever became of it since", async () => {
    const id = await card();
    fake.put("stamps", {
      ...(fake.get("stamps", HEART) as Doc & { id: string }),
      name: "Umbenannt",
    });
    expect((await look(id)).body.stamp).toMatchObject({ name: "Herz" });
  });

  it("tells whoever is logged in whether it is theirs, or taken", async () => {
    const id = await card();
    expect((await look(id, ANNA)).body).toMatchObject({
      mine: true,
      taken: false,
    });
    expect((await look(id, BEN)).body).toMatchObject({
      mine: false,
      taken: false,
    });
    await take(id, BEN);
    expect((await look(id, BEN)).body).toMatchObject({
      mine: false,
      taken: true,
    });
    expect((await look(id, CARL)).body.taken).toBe(false);
  });

  it("is not found for a link that is no card's", async () => {
    await card();
    expect((await look("AbCd1234EfGh")).status).toBe(404);
    expect((await look("nope")).status).toBe(404);
    expect((await look(HEART)).status).toBe(404);
  });

  it("is gone with the stamp it was made of", async () => {
    const id = await card();
    fake.put("stamps", { id: HEART, owner: ANNA, name: "", deleted: true });
    expect((await look(id)).status).toBe(404);
    expect((await take(id, BEN)).status).toBe(404);
    expect(stampsOf(BEN)).toEqual([]);
  });
});

describe("taking a card", () => {
  it("gives a copy of one's own – with where it came from", async () => {
    const id = await card();
    later();
    const answer = await take(id, BEN);
    expect(answer.status).toBe(200);
    const [copy] = stampsOf(BEN);
    expect(answer.body).toEqual({ stamp: copy.id });
    expect(copy.id).not.toBe(HEART);
    expect(copy).toMatchObject({
      name: "Herz",
      // A color that isn't public stays: it came with the stamp.
      color: "gold",
      shape: "diamond",
      drawing: DRAWING,
      owner: BEN,
      sharedWith: [],
      origin: {
        kind: "card",
        from: ANNA,
        name: "Anna",
        message: "Für dich!",
        card: id,
        // The stamp it is a copy of – for the day a stamp can be changed.
        stamp: HEART,
      },
      deleted: false,
    });
    // Ben's open apps sync – Anna hears nothing.
    expect(beside.nudged).toEqual([BEN]);
  });

  it("comes with the sync – the giver by name, the card's id never", async () => {
    const id = await card();
    await take(id, BEN);
    const { stamps } = await synced(BEN);
    expect(stamps).toHaveLength(1);
    expect(stamps[0].origin).toEqual({
      kind: "card",
      from: ANNA,
      name: "Anna",
      message: "Für dich!",
    });
    expect(JSON.stringify(stamps)).not.toContain(id);
    // Anna's own stamp came from nobody.
    expect((await synced(ANNA)).stamps.map((stamp) => stamp.origin)).toEqual([
      undefined,
    ]);
  });

  it("gives the same stamp back when taken twice", async () => {
    const id = await card();
    const first = await take(id, BEN);
    const second = await take(id, BEN);
    expect(second).toEqual(first);
    expect(stampsOf(BEN)).toHaveLength(1);
    // Someone else gets one of their own.
    const carls = await take(id, CARL);
    expect(carls.body.stamp).not.toBe(first.body.stamp);
    expect(stampsOf(CARL)).toHaveLength(1);
  });

  it("gives a new one to whoever deleted theirs", async () => {
    const id = await card();
    const first = String((await take(id, BEN)).body.stamp);
    fake.put("stamps", { id: first, owner: BEN, name: "", deleted: true });
    const again = String((await take(id, BEN)).body.stamp);
    expect(again).not.toBe(first);
  });

  it("is not for one's own card, nor without a login", async () => {
    const id = await card();
    expect((await take(id, ANNA)).status).toBe(403);
    expect((await take(id)).status).toBe(401);
    expect(fake.db.stamps.size).toBe(1);
    expect(beside.nudged).toEqual([]);
  });

  it("names the giver as they are called then – and keeps that", async () => {
    const id = await card();
    fake.account({ id: ANNA, name: "Anna B.", email: "anna@example.com" });
    await take(id, BEN);
    fake.account({ id: ANNA, name: "Annabel", email: "anna@example.com" });
    expect((await synced(BEN)).stamps[0].origin?.name).toBe("Anna B.");
  });

  it("tells the members of a calendar it is shared with only that it came from a card", async () => {
    const copy = String((await take(await card(), BEN)).body.stamp);
    fake.put("calendars", {
      id: FAMILY,
      name: "Familie",
      color: "sky",
      owner: BEN,
      members: [BEN, CARL],
      deleted: false,
    });
    fake.put("stamps", {
      ...(fake.get("stamps", copy) as Doc & { id: string }),
      sharedWith: [FAMILY],
    });
    const carls = (await synced(CARL)).stamps.find((one) => one.id === copy);
    expect(carls?.origin).toEqual({ kind: "card", from: null, name: "" });
  });
});

describe("where a card went", () => {
  it("shows the giver their cards, the newest first – and who took each", async () => {
    const first = await card("Erste");
    later();
    const second = await card("Zweite");
    later();
    await take(first, CARL);
    later();
    await take(first, BEN);
    const answer = await sent(ANNA);
    expect(answer.status).toBe(200);
    expect(answer.body.cards).toEqual([
      {
        id: second,
        stamp: HEART,
        message: "Zweite",
        createdAt: new Date(START + MINUTE).toISOString(),
        takers: [],
      },
      {
        id: first,
        stamp: HEART,
        message: "Erste",
        createdAt: new Date(START).toISOString(),
        // In the order they took it – by name, nothing else of them.
        takers: ["Carl", "Ben"],
      },
    ]);
    const told = JSON.stringify(answer.body);
    for (const secret of [BEN, CARL, "ben@example.com", "carl@example.com"]) {
      expect(told).not.toContain(secret);
    }
  });

  it("shows only one's own – and nothing without a login", async () => {
    await card();
    fake.put("stamps", { id: STAR, owner: BEN, name: "Stern", deleted: false });
    const bens = String((await send(BEN, STAR)).body.id);
    expect((await sent(BEN)).body.cards.map((one) => one.id)).toEqual([bens]);
    expect((await sent(CARL)).body.cards).toEqual([]);
    expect((await sent()).status).toBe(401);
  });

  it("no longer names who deleted their copy, or their account", async () => {
    const id = await card();
    const bens = String((await take(id, BEN)).body.stamp);
    later();
    await take(id, CARL);
    fake.put("stamps", { id: bens, owner: BEN, name: "", deleted: true });
    expect((await sent(ANNA)).body.cards[0].takers).toEqual(["Carl"]);
    fake.db.accounts.delete(CARL);
    expect((await sent(ANNA)).body.cards[0].takers).toEqual([]);
  });

  it("lets only the giver take a card back", async () => {
    const id = await card();
    expect((await takeBack(id, BEN)).status).toBe(403);
    expect((await takeBack(id)).status).toBe(401);
    expect((await takeBack("AbCd1234EfGh", ANNA)).status).toBe(404);
    expect(fake.db.cards.has(id)).toBe(true);
    expect((await look(id)).status).toBe(200);
  });

  it("kills the link when taken back – the copies taken stay as they are", async () => {
    const id = await card();
    const copy = String((await take(id, BEN)).body.stamp);
    expect(await takeBack(id, ANNA)).toEqual({ status: 200, body: {} });
    expect((await look(id)).status).toBe(404);
    expect((await take(id, CARL)).status).toBe(404);
    expect((await takeBack(id, ANNA)).status).toBe(404);
    expect((await sent(ANNA)).body.cards).toEqual([]);
    expect(fake.get("stamps", copy)).toMatchObject({
      owner: BEN,
      deleted: false,
      drawing: DRAWING,
      origin: { kind: "card", from: ANNA, name: "Anna", card: id },
    });
    // And Anna's stamp is hers, untouched.
    expect(fake.get("stamps", HEART)).toMatchObject({ deleted: false });
  });
});

describe("what goes with the stamp and with the giver", () => {
  const hook = (doc: Doc, previousDoc: Doc) =>
    dropCards({
      doc,
      previousDoc,
      req: { payload: fake.payload },
    } as unknown as Parameters<typeof dropCards>[0]);

  it("drops a stamp's cards when it is deleted – not at any other change", async () => {
    const id = await card();
    fake.put("stamps", { id: STAR, owner: BEN, name: "Stern", deleted: false });
    const bens = String((await send(BEN, STAR)).body.id);
    await hook({ id: HEART, name: "Neu" }, { id: HEART, name: "Herz" });
    expect(fake.db.cards.has(id)).toBe(true);
    await hook({ id: HEART, deleted: true }, { id: HEART, deleted: false });
    expect(fake.db.cards.has(id)).toBe(false);
    expect(fake.db.cards.has(bens)).toBe(true);
  });

  it("takes the giver's cards along with the account – the copies stay, without them", async () => {
    const id = await card();
    const copy = String((await take(id, BEN)).body.stamp);
    fake.put("stamps", { id: STAR, owner: BEN, name: "Stern", deleted: false });
    const bens = String((await send(BEN, STAR)).body.id);
    later();
    const [removeData] = Accounts.hooks?.beforeDelete ?? [];
    await removeData?.({
      id: ANNA,
      req: { payload: fake.payload },
    } as unknown as Parameters<NonNullable<typeof removeData>>[0]);

    expect(fake.db.cards.has(id)).toBe(false);
    expect(fake.db.cards.has(bens)).toBe(true);
    expect(fake.get("stamps", HEART)).toMatchObject({ deleted: true });
    // Ben keeps his – the drawing, his prints – only not whom it came from.
    expect(fake.get("stamps", copy)).toMatchObject({
      owner: BEN,
      deleted: false,
      drawing: DRAWING,
      origin: { kind: "card", from: null, name: "", card: id },
      changedAt: new Date(START + MINUTE).toISOString(),
    });
    expect((await synced(BEN)).stamps[0].origin).toMatchObject({
      kind: "card",
      from: null,
      name: "",
    });
  });
});

describe("a gift from Boop", () => {
  const GIFT = "0000000000000000000000a1";
  const NEW = "acc-new";

  const putGift = (more: Doc = {}) =>
    fake.put("gifts", {
      id: GIFT,
      name: { de: "Kürbis", en: "Pumpkin" },
      message: { de: "Frohes Stempeln!", en: "Happy stamping!" },
      card: "AbCd1234EfGh",
      color: "gold",
      shape: "square",
      drawing: DRAWING,
      ...more,
    });

  const copies = () =>
    [...fake.db.stamps.values()].filter(
      (stamp) => (stamp.origin as Doc | undefined)?.gift === GIFT
    );

  const give = (portion?: number) =>
    sendGift(fake.payload as Payload, GIFT, { portion });

  it("goes to every account with a confirmed address – in its language", async () => {
    putGift();
    fake.account({
      id: "acc-unconfirmed",
      name: "Neu",
      email: "neu@example.com",
      _verified: false,
    });
    expect(await give()).toEqual({ sent: 3, had: 0 });
    expect(copies().map((copy) => copy.owner)).toEqual([ANNA, BEN, CARL]);
    expect(stampsOf(ANNA).find((stamp) => stamp.origin)).toMatchObject({
      name: "Kürbis",
      color: "gold",
      shape: "square",
      drawing: DRAWING,
      sharedWith: [],
      origin: {
        kind: "gift",
        from: null,
        name: "Boop",
        message: "Frohes Stempeln!",
        gift: GIFT,
      },
      // A parcel on the shelf, until it is unwrapped.
      wrapped: true,
      deleted: false,
    });
    expect(stampsOf(BEN)[0]).toMatchObject({
      name: "Pumpkin",
      origin: { message: "Happy stamping!" },
    });
    // Each a stamp of its own.
    expect(new Set(copies().map((copy) => copy.id)).size).toBe(3);
    expect(fake.get("gifts", GIFT)).toMatchObject({
      sentAt: new Date(START).toISOString(),
      sentTo: 3,
    });
  });

  it("shows up in the app at once, and on the devices that want to hear", async () => {
    putGift();
    await give();
    expect(beside.nudged).toEqual([ANNA, BEN, CARL]);
    expect(beside.gifted).toEqual([
      {
        gift: GIFT,
        name: { de: "Kürbis", en: "Pumpkin" },
        accounts: [ANNA, BEN, CARL],
      },
    ]);
    const [copy] = (await synced(BEN)).stamps;
    expect(copy.origin).toEqual({
      kind: "gift",
      from: null,
      name: "Boop",
      message: "Happy stamping!",
    });
    expect(copy.wrapped).toBe(true);
  });

  it("goes out in portions – nobody left out between them", async () => {
    putGift();
    expect(await give(2)).toEqual({ sent: 3, had: 0 });
    expect(beside.gifted.map((told) => told.accounts)).toEqual([
      [ANNA, BEN],
      [CARL],
    ]);
    expect(copies()).toHaveLength(3);
  });

  it("gives nobody a second one when sent again – only those without", async () => {
    putGift();
    await give();
    // Ben deleted his: he had it. And someone signed up since.
    const bens = stampsOf(BEN)[0];
    fake.put("stamps", {
      id: String(bens.id),
      owner: BEN,
      name: "",
      drawing: null,
      origin: { kind: "gift", from: null, name: "", gift: GIFT },
      deleted: true,
    });
    fake.account({ id: NEW, name: "Neu", email: "neu@example.com" });
    beside.nudged.length = 0;
    later();
    expect(await give(2)).toEqual({ sent: 1, had: 3 });
    expect(beside.nudged).toEqual([NEW]);
    expect(copies().filter((copy) => copy.owner === ANNA)).toHaveLength(1);
    expect(copies().filter((copy) => copy.owner === BEN)).toHaveLength(1);
    expect(fake.get("gifts", GIFT)).toMatchObject({
      sentAt: new Date(START + MINUTE).toISOString(),
      sentTo: 4,
    });
  });

  it("falls back to the other language where one is missing", async () => {
    putGift({ name: { de: "Kürbis" }, message: { de: "", en: null } });
    await give();
    expect(stampsOf(BEN)[0]).toMatchObject({
      name: "Kürbis",
      origin: { message: "" },
    });
    expect((await synced(BEN)).stamps[0].origin).toEqual({
      kind: "gift",
      from: null,
      name: "Boop",
    });
  });

  describe("sent straight from the app", () => {
    const fromStamp = (as: string | undefined, stamp: string, message = "") =>
      call(Gifts, "post", "/from-stamp", { as, body: { stamp, message } });

    /** Anna with the admin box ticked – as the database has it. */
    const tick = (id = ANNA, name = "Anna") =>
      fake.account({ id, name, email: "anna@example.com", admin: true });

    const gifts = () => [...fake.db.gifts.values()];
    const gifted = () =>
      [...fake.db.stamps.values()].filter(
        (stamp) => (stamp.origin as Doc | undefined)?.kind === "gift"
      );

    it("is for an account with the admin box alone", async () => {
      expect((await fromStamp(undefined, HEART)).status).toBe(401);
      expect((await fromStamp(ANNA, HEART)).status).toBe(403);
      // Ben's own stamp, Ben without the box: no.
      fake.put("stamps", {
        id: STAR,
        owner: BEN,
        name: "Stern",
        drawing: DRAWING,
        deleted: false,
      });
      expect((await fromStamp(BEN, STAR)).status).toBe(403);
      expect(gifts()).toEqual([]);
      expect(gifted()).toEqual([]);
    });

    it("goes by the box as the database has it now – not as a login once heard", async () => {
      const endpoint = (Gifts.endpoints as Endpoint[]).find(
        (one) => one.path === "/from-stamp"
      );
      const response = await endpoint?.handler({
        ...request(ANNA),
        // Unticked since: the login still says yes.
        context: {
          sessionAccount: { id: ANNA, collection: "accounts", admin: true },
        },
        routeParams: {},
        json: async () => ({ stamp: HEART }),
      } as unknown as PayloadRequest);
      expect(response?.status).toBe(403);
      expect(gifts()).toEqual([]);
    });

    it("makes a gift of the stamp as it is – and sends it to everyone, the sender too", async () => {
      tick();
      const answer = await fromStamp(ANNA, HEART, "  Frohes   Stempeln! ");
      expect(answer.status).toBe(202);
      expect(answer.body.sent).toBe(3);
      const [gift] = gifts();
      expect(answer.body.gift).toBe(gift.id);
      expect(gift).toMatchObject({
        // Her words and the stamp's name – the same in every language.
        name: { de: "Herz", en: "Herz" },
        message: { de: "Frohes Stempeln!", en: "Frohes Stempeln!" },
        color: "gold",
        shape: "diamond",
        drawing: DRAWING,
      });
      expect("card" in gift).toBe(false);
      // On its way in the background.
      await vi.waitFor(() =>
        expect(fake.get("gifts", String(gift.id))?.sentTo).toBe(3)
      );
      expect(gifted().map((copy) => copy.owner)).toEqual([ANNA, BEN, CARL]);
      expect(gifted()[1]).toMatchObject({
        name: "Herz",
        color: "gold",
        shape: "diamond",
        drawing: DRAWING,
        origin: {
          kind: "gift",
          from: null,
          name: "Boop",
          message: "Frohes Stempeln!",
          gift: gift.id,
          stamp: HEART,
        },
      });
      expect(gift.stamp).toBe(HEART);
      // Anna keeps her own beside the copy that came back to her.
      expect(stampsOf(ANNA).map((stamp) => stamp.id)).toContain(HEART);
      expect(stampsOf(ANNA)).toHaveLength(2);
      expect(beside.nudged).toEqual([ANNA, BEN, CARL]);
      expect(beside.gifted).toHaveLength(1);
    });

    it("calls a gift without a name a surprise – in each account's language", async () => {
      tick();
      fake.put("stamps", {
        ...(fake.get("stamps", HEART) as Doc & { id: string }),
        name: " ",
      });
      const answer = await fromStamp(ANNA, HEART);
      const id = String(answer.body.gift);
      expect(fake.get("gifts", id)).toMatchObject({
        name: { de: "Überraschung", en: "Surprise" },
        message: { de: "", en: "" },
      });
      await vi.waitFor(() => expect(fake.get("gifts", id)?.sentTo).toBe(3));
      expect(stampsOf(BEN)[0].name).toBe("Surprise");
      expect(stampsOf(CARL)[0].name).toBe("Überraschung");
    });

    it("sends only a stamp of one's own that one drew", async () => {
      tick();
      // Ben's stamp, a deleted one, none at all.
      fake.put("stamps", {
        id: STAR,
        owner: BEN,
        name: "Stern",
        drawing: DRAWING,
        deleted: false,
      });
      expect((await fromStamp(ANNA, STAR)).status).toBe(404);
      expect((await fromStamp(ANNA, FAMILY)).status).toBe(404);
      expect((await fromStamp(ANNA, "nope")).status).toBe(404);
      fake.put("stamps", { id: STAR, owner: ANNA, name: "", deleted: true });
      expect((await fromStamp(ANNA, STAR)).status).toBe(404);
      // One that came from someone – a card, a gift – is not passed on.
      fake.put("stamps", {
        id: STAR,
        owner: ANNA,
        name: "Stern",
        drawing: DRAWING,
        origin: { kind: "card", from: BEN, name: "Ben", card: "AbCd1234EfGh" },
        deleted: false,
      });
      expect((await fromStamp(ANNA, STAR)).status).toBe(400);
      expect(gifts()).toEqual([]);
      expect(gifted()).toEqual([]);
    });

    it("lets only a few go out an hour", async () => {
      tick();
      for (let n = 0; n < 3; n++) {
        expect((await fromStamp(ANNA, HEART)).status).toBe(202);
        await vi.waitFor(() => expect(gifts()[0]?.sentAt).toBeTruthy());
      }
      expect((await fromStamp(ANNA, HEART)).status).toBe(429);
      later(61);
      expect((await fromStamp(ANNA, HEART)).status).toBe(202);
    });

    it("sent again, is the same gift – for those who came since, nobody twice", async () => {
      tick();
      const first = await fromStamp(ANNA, HEART);
      await vi.waitFor(() => expect(gifted()).toHaveLength(3));
      // Nobody new: nobody gets it.
      const again = await fromStamp(ANNA, HEART, "Andere Worte");
      expect(again.body).toEqual({ gift: first.body.gift, sent: 0 });
      // Dora signs up – the next sending is hers alone.
      const DORA = `acc-dora-${run}`;
      fake.account({ id: DORA, name: "Dora", email: "dora@example.com" });
      const third = await fromStamp(ANNA, HEART);
      expect(third.body).toEqual({ gift: first.body.gift, sent: 1 });
      await vi.waitFor(() => expect(gifted()).toHaveLength(4));
      expect(gifts()).toHaveLength(1);
      const owners = gifted().map((copy) => copy.owner);
      expect(new Set(owners).size).toBe(4);
      expect(owners).toContain(DORA);
    });
  });

  describe("its page in the CMS", () => {
    const admin = { id: "admin-1", collection: "users" };
    const [takeDrawing] = Gifts.hooks?.beforeChange ?? [];
    const save = (data: Doc, originalDoc?: Doc) =>
      takeDrawing?.({
        data,
        originalDoc,
        req: { payload: fake.payload },
      } as unknown as Parameters<NonNullable<typeof takeDrawing>>[0]);

    it("takes the stamp from a card's link – shape, drawing, and its color if none is picked", async () => {
      const id = await card();
      const link = `https://boop.example/de/card/${id}`;
      expect(await save({ name: "Kürbis", card: link })).toEqual({
        name: "Kürbis",
        card: id,
        // The stamp the card was made of – the copies keep it.
        stamp: HEART,
        shape: "diamond",
        drawing: DRAWING,
        color: "gold",
      });
      expect(await save({ card: id, color: "mint" })).toMatchObject({
        card: id,
        color: "mint",
        drawing: DRAWING,
      });
    });

    it("refuses a link that is no card's", async () => {
      await expect(save({ card: "AbCd1234EfGh" })).rejects.toThrow(/card/i);
    });

    it("keeps what it took once the card is gone – until another link comes", async () => {
      const id = await card();
      const kept = await save({ card: id });
      await takeBack(id, ANNA);
      expect(await save({ ...kept, name: "Neu" }, kept as Doc)).toMatchObject({
        card: id,
        drawing: DRAWING,
        name: "Neu",
      });
      await expect(
        save({ ...kept, card: "ZzZz9999YyYy" }, kept as Doc)
      ).rejects.toThrow();
    });

    it("sends for an admin alone", async () => {
      putGift();
      const send = (who: { as?: string; user?: unknown }, id = GIFT) =>
        call(Gifts, "post", "/:id/send", { ...who, params: { id } });
      expect((await send({})).status).toBe(401);
      // An account – the “Admin” box ticked or not – is no admin.
      fake.account({
        id: ANNA,
        name: "Anna",
        email: "anna@example.com",
        admin: true,
      });
      expect((await send({ as: ANNA })).status).toBe(401);
      expect(
        (
          await send({
            user: { id: ANNA, collection: "accounts", admin: true },
          })
        ).status
      ).toBe(401);
      expect(copies()).toEqual([]);

      expect((await send({ user: admin }, "0".repeat(24))).status).toBe(404);
      const answer = await send({ user: admin });
      expect(answer).toEqual({ status: 202, body: { accounts: 3 } });
      // On its way in the background.
      await vi.waitFor(() => expect(fake.get("gifts", GIFT)?.sentTo).toBe(3));
      expect(copies()).toHaveLength(3);
    });

    it("sends nothing that has no stamp yet", async () => {
      putGift({ drawing: null, shape: null });
      const answer = await call(Gifts, "post", "/:id/send", {
        user: admin,
        params: { id: GIFT },
      });
      expect(answer.status).toBe(400);
      expect(copies()).toEqual([]);
    });
  });
});
