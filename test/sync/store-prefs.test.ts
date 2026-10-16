import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One's own settings for a calendar on the device (offline/store.ts, “Own
 * settings”): the ones kept from before go to the server once, the
 * server's are taken over, a change goes out – against a device's copy in
 * memory and a server that answers as told.
 */

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

type Op =
  | { store: string; put: unknown; key?: string }
  | { store: string; delete: unknown };

/** The device's copy (offline/db.ts), in memory. */
const device = vi.hoisted(() => ({
  stores: {} as Record<string, Map<unknown, unknown>>,
}));
const storeOf = (name: string) => {
  device.stores[name] ??= new Map();
  return device.stores[name];
};
const KEYS: Record<string, string> = {
  calendars: "id",
  stamps: "id",
  placements: "id",
  notes: "id",
  outbox: "seq",
};
vi.doMock("../../src/features/offline/db", () => ({
  getAll: async (name: string) => [...storeOf(name).values()],
  getMeta: async (key: string) => storeOf("meta").get(key),
  write: async (ops: Op[]) => {
    for (const op of ops) {
      const store = storeOf(op.store);
      if ("put" in op) {
        const value = structuredClone(op.put);
        const key =
          op.key ?? (value as Record<string, unknown>)[KEYS[op.store]];
        store.set(key, value);
      } else store.delete(op.delete);
    }
  },
  clearAll: async () => {
    for (const store of Object.values(device.stores)) store.clear();
  },
}));
// The store itself fresh for every test – it starts once per page.
vi.doUnmock("../../src/features/offline/store");
vi.doUnmock("@/features/offline/store");
vi.doMock("@/features/accounts/client", () => ({
  fetchMe: async () => null,
  logout: async () => true,
  sessionOver: () => false,
}));

const { LONG_AGO, prefId } = await import("../../src/features/calendar/prefs");

const ME = "6710f3c2a1b2c3d4e5f60702";
const FAMILY = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const SPORT = "9a8b7c6d-5e4f-4321-8765-0fedcba98765";

const calendar = (id: string) => ({
  id,
  name: id === FAMILY ? "Familie" : "Sport",
  color: "sky",
  owner: "someone",
  members: ["someone", ME],
  personal: false,
  changedAt: "2026-10-01T00:00:00.000Z",
  deleted: false,
});

type Sent = {
  changes: { type: string; id: string; changedAt: string; data?: unknown }[];
};

/** The server: what each sync sent, and what it answers. */
let sent: Sent[] = [];
let answer: {
  prefs?: unknown[];
  calendarIds?: string[];
  rejected?: unknown[];
} = {};

const respond = () => ({
  now: new Date().toISOString(),
  me: { id: ME, name: "Ben", email: "ben@example.com", locale: "de" },
  calendarIds: answer.calendarIds ?? [FAMILY, SPORT],
  people: [],
  calendars: [],
  stamps: [],
  shared: [],
  placements: [],
  notes: [],
  prefs: answer.prefs ?? [],
  invitations: [],
  rejected: answer.rejected ?? [],
});

/** The store, as it starts on a device with this copy. */
const startWith = async (meta: Record<string, unknown>) => {
  device.stores = {};
  for (const [key, value] of Object.entries(meta))
    storeOf("meta").set(key, value);
  for (const id of [FAMILY, SPORT]) storeOf("calendars").set(id, calendar(id));
  vi.resetModules();
  const store = await import("../../src/features/offline/store");
  await store.start();
  await store.sync();
  // A sync asked for meanwhile follows by itself – done, too.
  await vi.waitFor(() => expect(store.boop.syncing).toBe(false));
  return store;
};

/** Every pref change sent so far. */
const prefsSent = () =>
  sent.flatMap((body) => body.changes.filter((one) => one.type === "pref"));

beforeEach(() => {
  sent = [];
  answer = {};
  vi.stubGlobal("window", {
    addEventListener: () => undefined,
    location: { reload: () => undefined },
  });
  vi.stubGlobal("document", {
    addEventListener: () => undefined,
    visibilityState: "hidden",
  });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("setInterval", () => 0);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Sent;
      sent.push(body);
      return new Response(JSON.stringify(respond()), { status: 200 });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ME_DOC = { id: ME, name: "Ben", email: "ben@example.com", locale: "de" };

describe("the settings a device kept from before", () => {
  it("go to the server once – as old as can be, for the calendars still here", async () => {
    const store = await startWith({
      me: ME_DOC,
      prefs: {
        [FAMILY]: { color: "sun", view: "year" },
        [SPORT]: { start: "today" },
        "22222222-2222-4333-8444-555555555555": { color: "mint" },
      },
    });
    await vi.waitFor(() => expect(prefsSent()).toHaveLength(2));
    expect(prefsSent()).toEqual([
      {
        type: "pref",
        id: prefId(ME, FAMILY),
        changedAt: LONG_AGO,
        data: { calendar: FAMILY, color: "sun", start: null },
      },
      {
        type: "pref",
        id: prefId(ME, SPORT),
        changedAt: LONG_AGO,
        data: { calendar: SPORT, color: null, start: "today" },
      },
    ]);
    expect(storeOf("meta").get("prefsSent")).toBe(true);
    expect(store.boop.pending).toBe(0);
  });

  it("give way to what another device sent before – the server's come back", async () => {
    answer.prefs = [
      {
        id: prefId(ME, FAMILY),
        calendar: FAMILY,
        color: "mint",
        start: null,
        changedAt: "2026-10-15T08:00:00.000Z",
        deleted: false,
      },
    ];
    const store = await startWith({
      me: ME_DOC,
      prefs: { [FAMILY]: { color: "sun" } },
    });
    await vi.waitFor(() =>
      expect(store.prefOf(store.boop, FAMILY)).toEqual({ color: "mint" })
    );
    expect(storeOf("meta").get("prefs")).toEqual({
      [FAMILY]: { color: "mint" },
    });
  });

  it("are sent no second time", async () => {
    await startWith({
      me: ME_DOC,
      prefsSent: true,
      prefs: { [FAMILY]: { color: "sun" } },
    });
    expect(prefsSent()).toEqual([]);
  });
});

describe("one's own settings on the device", () => {
  it("go out when set – both, under the account's id for the calendar", async () => {
    const store = await startWith({ me: ME_DOC, prefsSent: true });
    await store.setCalendarPref(FAMILY, { color: "rose" });
    expect(store.colorOf(store.boop, store.boop.calendars[FAMILY])).toBe(
      "rose"
    );
    await store.sync();
    expect(prefsSent().at(-1)).toMatchObject({
      type: "pref",
      id: prefId(ME, FAMILY),
      data: { calendar: FAMILY, color: "rose", start: null },
    });
    // The same again: nothing to send.
    const before = prefsSent().length;
    await store.setCalendarPref(FAMILY, { color: "rose" });
    await store.sync();
    expect(prefsSent()).toHaveLength(before);
    // Taken back: null.
    await store.setCalendarPref(FAMILY, { color: null });
    await store.sync();
    expect(prefsSent().at(-1)?.data).toEqual({
      calendar: FAMILY,
      color: null,
      start: null,
    });
    expect(store.prefOf(store.boop, FAMILY)).toEqual({});
  });

  it("take the server's – taken back there, gone here too", async () => {
    answer.prefs = [
      {
        id: prefId(ME, SPORT),
        calendar: SPORT,
        color: null,
        start: "year",
        changedAt: "2026-10-15T08:00:00.000Z",
        deleted: false,
      },
    ];
    const store = await startWith({ me: ME_DOC, prefsSent: true });
    expect(store.prefOf(store.boop, SPORT)).toEqual({ start: "year" });
    answer.prefs = [
      {
        id: prefId(ME, SPORT),
        calendar: SPORT,
        color: null,
        start: null,
        changedAt: "2026-10-15T09:00:00.000Z",
        deleted: false,
      },
    ];
    await store.sync();
    expect(store.prefOf(store.boop, SPORT)).toEqual({});
  });

  it("stay as set here while the change waits – a refusal takes nothing away", async () => {
    const store = await startWith({ me: ME_DOC, prefsSent: true });
    const doc = (color: string) => ({
      id: prefId(ME, FAMILY),
      calendar: FAMILY,
      color,
      start: null,
      changedAt: "2026-10-15T08:00:00.000Z",
      deleted: false,
    });
    answer.prefs = [doc("mint")];
    answer.rejected = [{ type: "pref", id: prefId(ME, FAMILY), reason: "x" }];
    // Set here while the server answers: still waiting when the answer
    // comes – and the server has it from the next sync on.
    vi.mocked(fetch).mockImplementationOnce(async (_, init) => {
      sent.push(JSON.parse(String(init?.body)) as Sent);
      const stale = respond();
      await store.setCalendarPref(FAMILY, { color: "rose" });
      answer = { prefs: [doc("rose")] };
      return new Response(JSON.stringify(stale), { status: 200 });
    });
    await store.sync();
    expect(store.prefOf(store.boop, FAMILY)).toEqual({ color: "rose" });
    expect(prefsSent().at(-1)?.data).toMatchObject({ color: "rose" });
  });

  it("go with a calendar that leaves the device", async () => {
    answer.prefs = [
      {
        id: prefId(ME, SPORT),
        calendar: SPORT,
        color: "sun",
        start: null,
        changedAt: "2026-10-15T08:00:00.000Z",
        deleted: false,
      },
    ];
    const store = await startWith({ me: ME_DOC, prefsSent: true });
    expect(store.prefOf(store.boop, SPORT)).toEqual({ color: "sun" });
    answer.prefs = [];
    answer.calendarIds = [FAMILY];
    await store.sync();
    expect(store.prefOf(store.boop, SPORT)).toEqual({});
    expect(storeOf("meta").get("prefs")).toEqual({});
  });
});
