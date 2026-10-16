import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A stamp drawn anew on the device (offline/store.ts, `updateStamp`): at
 * once in the store and the device's copy, and one change in the outbox
 * with what changed, no more – for the sync to take to the server. Only
 * for a stamp the account drew itself.
 */

// What the device's copy (IndexedDB, db.ts) is told – noted here.
const device = vi.hoisted(() => ({ ops: [] as Record<string, unknown>[] }));

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
vi.doMock("../../src/features/offline/db.ts", () => ({
  getAll: async () => [],
  getMeta: async () => undefined,
  clearAll: async () => undefined,
  write: async (ops: Record<string, unknown>[]) => {
    device.ops.push(...ops);
  },
}));

const { boop, updateStamp } = await import("../../src/features/offline/store");

const ME = "acc-me";
const ANNA = "acc-anna";
const HOME = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const COPY = "11111111-2222-4333-8444-555555555555";
const THEIRS = "33333333-4444-4555-8666-777777777777";
const DRAWING = {
  v: 1 as const,
  strokes: [{ w: 0.05, p: [0.1, 0.1, 0.9, 0.9] }],
};
const ANEW = {
  v: 1 as const,
  strokes: [
    {
      w: 0.03,
      p: [0.2, 0.5, 0.8, 0.5],
      a: [0.2, 0.5, 0.2, 0.5, 0.2, 0.5, 0.8, 0.5, 0.8, 0.5, 0.8, 0.5],
    },
  ],
  rim: "wave" as const,
};
const BEFORE = "2026-10-16T08:00:00.000Z";

const stamp = (id: string, owner: string) => ({
  id,
  name: "Herz",
  color: "mint",
  shape: "circle",
  drawing: DRAWING,
  owner,
  sharedWith: [],
  changedAt: BEFORE,
  deleted: false,
});

/** The changes waiting to be sent, as the outbox keeps them. */
const outbox = () =>
  device.ops
    .filter((op) => op.store === "outbox" && op.put)
    .map((op) => (op.put as { change: Record<string, unknown> }).change);

// The outbox lives as long as the store: each test draws a stamp of its own.
let run = 0;
let MINE = "";

beforeEach(() => {
  run++;
  MINE = `22222222-3333-4444-8555-${String(run).padStart(12, "0")}`;
  // No sync goes off – the outbox just waits.
  vi.useFakeTimers({ now: Date.parse("2026-10-16T09:00:00.000Z") });
  device.ops.length = 0;
  boop.me = { id: ME, name: "Ich", email: "ich@example.com" } as never;
  boop.stamps = {
    [MINE]: stamp(MINE, ME),
    [THEIRS]: stamp(THEIRS, ANNA),
    [COPY]: {
      ...stamp(COPY, ME),
      origin: { kind: "card", from: ANNA, name: "Anna" },
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a stamp drawn anew on the device", () => {
  it("shows the new look at once, kept on the device too", async () => {
    await updateStamp(MINE, { drawing: ANEW, shape: "heart" });
    expect(boop.stamps[MINE]).toMatchObject({
      drawing: ANEW,
      shape: "heart",
      color: "mint",
      name: "Herz",
      changedAt: "2026-10-16T09:00:00.000Z",
    });
    expect(device.ops).toContainEqual({
      store: "stamps",
      put: expect.objectContaining({ id: MINE, drawing: ANEW }),
    });
  });

  it("sends only what changed – changed again before it went, still one change", async () => {
    await updateStamp(MINE, { drawing: ANEW });
    vi.setSystemTime(Date.parse("2026-10-16T09:01:00.000Z"));
    await updateStamp(MINE, { color: "sky", sharedWith: [HOME] });
    const changes = outbox();
    expect(changes.at(-1)).toEqual({
      type: "stamp",
      id: MINE,
      changedAt: "2026-10-16T09:01:00.000Z",
      data: { drawing: ANEW, color: "sky", sharedWith: [HOME] },
    });
    expect(new Set(changes.map((change) => change.id))).toEqual(
      new Set([MINE])
    );
  });

  it("is nothing for someone else's stamp, a copy, or nothing changed", async () => {
    await updateStamp(THEIRS, { color: "sky" });
    await updateStamp(COPY, { drawing: ANEW });
    await updateStamp(MINE, {});
    await updateStamp("gone", { color: "sky" });
    expect(boop.stamps[THEIRS].color).toBe("mint");
    expect(boop.stamps[COPY].drawing).toEqual(DRAWING);
    expect(device.ops).toEqual([]);
  });
});
