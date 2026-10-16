import type { PayloadRequest } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDatabase } from "../calendar/fake-database";

/**
 * One's own settings for a calendar (calendar/prefs.ts) through the sync,
 * against a database in memory: who may write them (sync/apply.ts), who
 * gets them (sync/pull.ts), what a device sends of those it kept from
 * before, and what goes when the calendar, the membership or the account
 * goes – and that the export names them.
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
vi.doMock("@payload-config", () => ({ default: {} }));
vi.doMock("@/features/sync/live", () => ({
  nudge: () => undefined,
  nudgeCalendars: async () => undefined,
  liveEndpoint: {},
}));

const { applyChange } = await import("../../src/features/sync/apply");
const { pull } = await import("../../src/features/sync/pull");
const { removeMember } = await import(
  "../../src/features/calendar/endpoints/members"
);
const { Accounts } = await import("../../src/features/accounts/collection");
const { collectExport } = await import("../../src/features/accounts/export");
const { LONG_AGO, prefId } = await import("../../src/features/calendar/prefs");

type Doc = Record<string, unknown>;

const START = Date.parse("2026-10-16T10:00:00.000Z");
const MINUTE = 60_000;
const FAMILY = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const SPORT = "9a8b7c6d-5e4f-4321-8765-0fedcba98765";
const ANNA = "6710f3c2a1b2c3d4e5f60701";
const BEN = "6710f3c2a1b2c3d4e5f60702";

let fake: ReturnType<typeof fakeDatabase>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: START });
  fake = fakeDatabase();
  fake.account({ id: ANNA, name: "Anna", email: "anna@example.com" });
  fake.account({ id: BEN, name: "Ben", email: "ben@example.com" });
  // Anna's, with Ben in it – and Ben's own.
  fake.put("calendars", {
    id: FAMILY,
    name: "Familie",
    color: "sky",
    owner: ANNA,
    members: [ANNA, BEN],
    deleted: false,
  });
  fake.put("calendars", {
    id: SPORT,
    name: "Sport",
    color: "mint",
    owner: BEN,
    members: [BEN],
    deleted: false,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/** A time on a device – within the hour before now. */
const at = (minutes: number) =>
  new Date(START - 60 * MINUTE + minutes * MINUTE).toISOString();
const later = (minutes = 1) => vi.setSystemTime(Date.now() + minutes * MINUTE);

const request = () => ({ payload: fake.payload }) as unknown as PayloadRequest;

const mineOf = (account: string) =>
  [...fake.db.calendars.values()]
    .filter(
      (calendar) =>
        !calendar.deleted && (calendar.members as string[]).includes(account)
    )
    .map((calendar) => String(calendar.id));

/** A change of one's own settings, as a device sends it. */
const setPrefs = (
  as: string,
  calendar: string,
  data: Doc,
  changedAt: string,
  {
    id = prefId(as, calendar),
    special = [] as string[],
  }: { id?: string; special?: string[] } = {}
) =>
  applyChange(
    {
      req: request(),
      me: as,
      mine: new Set(mineOf(as)),
      unshared: new Set(),
      special: new Set(special),
    },
    { type: "pref", id, changedAt, data: { calendar, ...data } }
  );

const prefsOf = (account: string) =>
  [...fake.db["calendar-prefs"].values()].filter(
    (pref) => pref.account === account
  );

/** What a sync of the account brings – since a time, or all of it. */
const synced = (
  as: string,
  { since = null, sent = [] }: { since?: string | null; sent?: string[] } = {}
) =>
  pull(request(), as, {
    since,
    known: since ? mineOf(as) : [],
    need: [],
    touched: {
      calendar: new Set(),
      stamp: new Set(),
      placement: new Set(),
      note: new Set(),
      pref: new Set(sent),
    },
  });

describe("one's own settings, written through the sync", () => {
  it("are made by a member for a calendar it is in – under their id, and theirs", async () => {
    expect(
      await setPrefs(BEN, FAMILY, { color: "sun", start: "today" }, at(1))
    ).toEqual({ ok: true });
    expect(fake.get("calendar-prefs", prefId(BEN, FAMILY))).toMatchObject({
      account: BEN,
      calendar: FAMILY,
      color: "sun",
      start: "today",
      changedAt: at(1),
      deleted: false,
    });
  });

  it("are refused for a calendar one isn't in – and under any other id", async () => {
    expect(await setPrefs(ANNA, SPORT, { color: "sun" }, at(1))).toEqual({
      ok: false,
      reason: "not a member",
    });
    expect(
      await setPrefs(BEN, FAMILY, { color: "sun" }, at(1), {
        id: prefId(ANNA, FAMILY),
      })
    ).toEqual({ ok: false, reason: "not its own" });
    expect(fake.db["calendar-prefs"].size).toBe(0);
  });

  it("are nobody else's to change – not even a member's of the same calendar", async () => {
    await setPrefs(BEN, FAMILY, { color: "sun" }, at(1));
    expect(
      await setPrefs(ANNA, FAMILY, { color: "rose" }, at(2), {
        id: prefId(BEN, FAMILY),
      })
    ).toEqual({ ok: false, reason: "not yours" });
    expect(fake.get("calendar-prefs", prefId(BEN, FAMILY))?.color).toBe("sun");
  });

  it("go to the later change – the phone's yellow is the laptop's", async () => {
    await setPrefs(BEN, FAMILY, { color: "sun" }, at(5));
    // An older one from another device stays out.
    expect(await setPrefs(BEN, FAMILY, { color: "rose" }, at(3))).toEqual({
      ok: true,
    });
    expect(fake.get("calendar-prefs", prefId(BEN, FAMILY))?.color).toBe("sun");
    await setPrefs(BEN, FAMILY, { color: "mint", start: "year" }, at(7));
    expect(fake.get("calendar-prefs", prefId(BEN, FAMILY))).toMatchObject({
      color: "mint",
      start: "year",
      changedAt: at(7),
    });
  });

  it("take a setting back with null – and stay, empty, so the other devices hear of it", async () => {
    await setPrefs(BEN, FAMILY, { color: "sun", start: "today" }, at(1));
    await setPrefs(BEN, FAMILY, { color: null, start: "today" }, at(2));
    expect(fake.get("calendar-prefs", prefId(BEN, FAMILY))).toMatchObject({
      color: null,
      start: "today",
    });
    await setPrefs(BEN, FAMILY, { color: null, start: null }, at(3));
    expect(fake.get("calendar-prefs", prefId(BEN, FAMILY))).toMatchObject({
      color: null,
      start: null,
      deleted: false,
    });
    // Nothing set, and none there yet: nothing to keep.
    expect(
      await setPrefs(BEN, SPORT, { color: null, start: null }, at(4))
    ).toEqual({ ok: true });
    expect(fake.get("calendar-prefs", prefId(BEN, SPORT))).toBeUndefined();
  });

  it("keep what isn't one – an unknown view, a color that isn't public", async () => {
    await setPrefs(BEN, FAMILY, { color: "sun", start: "today" }, at(1));
    await setPrefs(BEN, FAMILY, { color: "gold", start: "week" }, at(2), {
      special: ["gold"],
    });
    expect(fake.get("calendar-prefs", prefId(BEN, FAMILY))).toMatchObject({
      color: "sun",
      start: "today",
    });
  });
});

describe("a device's settings from before", () => {
  it("are taken where the server has none for that calendar", async () => {
    expect(await setPrefs(BEN, FAMILY, { color: "sun" }, LONG_AGO)).toEqual({
      ok: true,
    });
    expect(fake.get("calendar-prefs", prefId(BEN, FAMILY))?.color).toBe("sun");
  });

  it("never overwrite what another device sent before – that is the later change", async () => {
    // The laptop, updated first, sent its own.
    await setPrefs(BEN, FAMILY, { color: null, start: "year" }, LONG_AGO);
    // The phone's, from before, come after – and stay out.
    expect(
      await setPrefs(BEN, FAMILY, { color: "rose", start: "today" }, LONG_AGO)
    ).toEqual({ ok: true });
    expect(fake.get("calendar-prefs", prefId(BEN, FAMILY))).toMatchObject({
      color: null,
      start: "year",
    });
    // And the phone gets the server's back with its sync.
    const { prefs } = await synced(BEN, {
      since: at(-1),
      sent: [prefId(BEN, FAMILY)],
    });
    expect(prefs).toEqual([
      expect.objectContaining({ color: null, start: "year" }),
    ]);
    // Anything set from now on wins over them, as always.
    await setPrefs(BEN, FAMILY, { color: "rose" }, at(1));
    expect(fake.get("calendar-prefs", prefId(BEN, FAMILY))?.color).toBe("rose");
  });
});

describe("one's own settings in the sync", () => {
  it("come to the account alone – for its calendars, checked", async () => {
    await setPrefs(ANNA, FAMILY, { color: "rose" }, at(1));
    await setPrefs(BEN, FAMILY, { color: "sun", start: "today" }, at(1));
    await setPrefs(BEN, SPORT, { start: "year" }, at(1));
    const { prefs } = await synced(BEN);
    expect(prefs).toEqual([
      {
        id: prefId(BEN, FAMILY),
        calendar: FAMILY,
        color: "sun",
        start: "today",
        changedAt: at(1),
        deleted: false,
      },
      {
        id: prefId(BEN, SPORT),
        calendar: SPORT,
        color: null,
        start: "year",
        changedAt: at(1),
        deleted: false,
      },
    ]);
    expect((await synced(ANNA)).prefs?.map((pref) => pref.color)).toEqual([
      "rose",
    ]);
  });

  it("come when they changed – on the account's other devices", async () => {
    await setPrefs(BEN, FAMILY, { color: "sun" }, at(1));
    later(5);
    const since = new Date().toISOString();
    expect((await synced(BEN, { since })).prefs).toEqual([]);
    later(1);
    await setPrefs(BEN, FAMILY, { color: "mint" }, at(6));
    expect((await synced(BEN, { since })).prefs).toEqual([
      expect.objectContaining({ calendar: FAMILY, color: "mint" }),
    ]);
  });
});

describe("what goes with the calendar, the membership and the account", () => {
  it("goes for the one who leaves – the others' stay", async () => {
    await setPrefs(ANNA, FAMILY, { color: "rose" }, at(1));
    await setPrefs(BEN, FAMILY, { color: "sun" }, at(1));
    await setPrefs(BEN, SPORT, { start: "year" }, at(1));
    const response = await removeMember.handler({
      payload: fake.payload,
      headers: new Headers(),
      context: {
        sessionAccount: {
          ...fake.get("accounts", BEN),
          collection: "accounts",
        },
      },
      routeParams: { id: FAMILY, accountId: BEN },
      user: null,
    } as unknown as PayloadRequest);
    expect(response.status).toBe(200);
    expect(prefsOf(BEN).map((pref) => pref.calendar)).toEqual([SPORT]);
    expect(prefsOf(ANNA)).toHaveLength(1);
    // His devices get none for it any more.
    expect((await synced(BEN)).prefs?.map((pref) => pref.calendar)).toEqual([
      SPORT,
    ]);
  });

  it("goes with the calendar – everyone's", async () => {
    await setPrefs(ANNA, FAMILY, { color: "rose" }, at(1));
    await setPrefs(BEN, FAMILY, { color: "sun" }, at(1));
    await setPrefs(BEN, SPORT, { start: "year" }, at(1));
    expect(
      await applyChange(
        {
          req: request(),
          me: ANNA,
          mine: new Set(mineOf(ANNA)),
          unshared: new Set(),
        },
        { type: "calendar", id: FAMILY, changedAt: at(2), deleted: true }
      )
    ).toEqual({ ok: true });
    expect([...fake.db["calendar-prefs"].values()]).toEqual([
      expect.objectContaining({ account: BEN, calendar: SPORT }),
    ]);
  });

  it("goes with the account – its own, and everyone's for its calendars", async () => {
    await setPrefs(ANNA, FAMILY, { color: "rose" }, at(1));
    await setPrefs(BEN, FAMILY, { color: "sun" }, at(1));
    await setPrefs(BEN, SPORT, { start: "year" }, at(1));
    const [removeData] = Accounts.hooks?.beforeDelete ?? [];
    await removeData?.({
      id: BEN,
      req: { payload: fake.payload },
    } as unknown as Parameters<NonNullable<typeof removeData>>[0]);
    expect(prefsOf(BEN)).toEqual([]);
    expect(prefsOf(ANNA)).toHaveLength(1);
    await removeData?.({
      id: ANNA,
      req: { payload: fake.payload },
    } as unknown as Parameters<NonNullable<typeof removeData>>[0]);
    expect(fake.db["calendar-prefs"].size).toBe(0);
  });
});

describe("the account's data as a file", () => {
  it("names its own settings for calendars – nobody else's", async () => {
    await setPrefs(ANNA, FAMILY, { color: "rose" }, at(1));
    await setPrefs(BEN, FAMILY, { color: "sun", start: "today" }, at(2));
    const file = await collectExport(request(), BEN);
    expect(file.calendarSettings).toEqual([
      { calendar: FAMILY, color: "sun", start: "today", changedAt: at(2) },
    ]);
  });
});
