import type { Endpoint, PayloadRequest } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Locale } from "../../src/i18n/config";
import { fakeDatabase } from "./fake-database";

/**
 * Invitations as invitations: whoever has an account is in only after a
 * yes. Through the endpoints – inviting (members.ts), the account's yes and
 * no (endpoints/invitations.ts), the mail's link and the login – and the
 * sync's reading (sync/pull.ts), against a database in memory.
 */

// What the endpoints do beside the database – noted here.
const beside = vi.hoisted(() => ({
  nudged: [] as string[],
  nudgedCalendars: [] as string[],
  told: [] as unknown[],
}));

// The app's paths (@/…), which the tests don't resolve – by their files.
const real = {
  "@/access": () => import("../../src/access"),
  "@/features/accounts/emails": () =>
    import("../../src/features/accounts/emails"),
  "@/features/accounts/retention": () =>
    import("../../src/features/accounts/retention"),
  "@/features/accounts/session": () =>
    import("../../src/features/accounts/session"),
  "@/features/calendar/endpoints/invitations": () =>
    import("../../src/features/calendar/endpoints/invitations"),
  "@/features/calendar/membership": () =>
    import("../../src/features/calendar/membership"),
  "@/features/calendar/model": () =>
    import("../../src/features/calendar/model"),
  "@/features/calendar/note": () => import("../../src/features/calendar/note"),
  "@/features/calendar/palette": () =>
    import("../../src/features/calendar/palette"),
  "@/features/sync/apply": () => import("../../src/features/sync/apply"),
  "@/i18n/config": () => import("../../src/i18n/config"),
  "@/lib/id": () => import("../../src/lib/id"),
  "@/lib/mail-layout": () => import("../../src/lib/mail-layout"),
  "@/lib/rate-limit": () => import("../../src/lib/rate-limit"),
  "@/lib/server-url": () => import("../../src/lib/server-url"),
};
vi.mock("@/access", () => real["@/access"]());
vi.mock("@/features/accounts/emails", () =>
  real["@/features/accounts/emails"]()
);
vi.mock("@/features/accounts/retention", () =>
  real["@/features/accounts/retention"]()
);
vi.mock("@/features/accounts/session", () =>
  real["@/features/accounts/session"]()
);
vi.mock("@/features/calendar/endpoints/invitations", () =>
  real["@/features/calendar/endpoints/invitations"]()
);
vi.mock("@/features/calendar/membership", () =>
  real["@/features/calendar/membership"]()
);
vi.mock("@/features/calendar/model", () => real["@/features/calendar/model"]());
vi.mock("@/features/calendar/note", () => real["@/features/calendar/note"]());
vi.mock("@/features/calendar/palette", () =>
  real["@/features/calendar/palette"]()
);
vi.mock("@/features/sync/apply", () => real["@/features/sync/apply"]());
vi.mock("@/i18n/config", () => real["@/i18n/config"]());
vi.mock("@/lib/id", () => real["@/lib/id"]());
vi.mock("@/lib/mail-layout", () => real["@/lib/mail-layout"]());
vi.mock("@/lib/rate-limit", () => real["@/lib/rate-limit"]());
vi.mock("@/lib/server-url", () => real["@/lib/server-url"]());
vi.mock("@/features/translations/get-texts", async () => {
  const { dictionaryOf } = await import("../../src/i18n/dictionaries");
  return { getDictionary: async (locale: Locale) => dictionaryOf(locale) };
});
vi.mock("@/features/sync/live", () => ({
  nudge: (accounts: Iterable<string>) => {
    beside.nudged.push(...accounts);
  },
  nudgeCalendars: async (_: unknown, calendars: Iterable<string>) => {
    beside.nudgedCalendars.push(...calendars);
  },
}));
vi.mock("@/features/push/invited", () => ({
  notifyInvited: (_: unknown, invitation: unknown) => {
    beside.told.push(invitation);
  },
}));

vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://boop.example");

const { addMember } = await import(
  "../../src/features/calendar/endpoints/members"
);
const { invitationEndpoints } = await import(
  "../../src/features/calendar/endpoints/invitations"
);
const { Invites, inviteEndpoints } = await import(
  "../../src/features/calendar/invites"
);
const { sessionEndpoints } = await import(
  "../../src/features/accounts/session"
);
const { pull } = await import("../../src/features/sync/pull");

const DAY = 86_400_000;
const START = Date.parse("2026-10-13T10:00:00.000Z");
const FAMILY = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const SPORT = "9a8b7c6d-5e4f-4321-8765-0fedcba98765";

let fake: ReturnType<typeof fakeDatabase>;
// The brake on inviting counts per account, for as long as the server
// runs: every test gets accounts of its own.
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
  // Anna's, with Carl in it already – and Carl's own.
  fake.put("calendars", {
    id: FAMILY,
    name: "Familie",
    color: "sky",
    owner: ANNA,
    members: [ANNA, CARL],
    deleted: false,
  });
  fake.put("calendars", {
    id: SPORT,
    name: "Sport",
    color: "mint",
    owner: CARL,
    members: [CARL],
    deleted: false,
  });
  beside.nudged.length = 0;
  beside.nudgedCalendars.length = 0;
  beside.told.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

type Answer = { status: number; body: Record<string, unknown> };

/** Calls an endpoint – logged in as `as` (an account's id), or as nobody. */
const call = async (
  endpoint: Endpoint | undefined,
  {
    as,
    params = {},
    body = {},
  }: { as?: string; params?: Record<string, string>; body?: unknown } = {}
): Promise<Answer> => {
  if (!endpoint) throw new Error("No such endpoint.");
  const account = as ? fake.get("accounts", as) : null;
  const response = await endpoint.handler({
    payload: fake.payload,
    headers: new Headers(),
    // Where `sessionAccount` keeps whom it found for the request.
    context: {
      sessionAccount: account ? { ...account, collection: "accounts" } : null,
    },
    routeParams: params,
    json: async () => body,
    user: null,
  } as unknown as PayloadRequest);
  return { status: response.status, body: await response.json() };
};

const invite = (as: string, email: string, calendar = FAMILY) =>
  call(addMember, { as, params: { id: calendar }, body: { email } });

const byPath = (endpoints: Endpoint[], path: string, method = "post") =>
  endpoints.find((one) => one.path === path && one.method === method);

const answer = (as: string, id: string, what: "accept" | "decline") =>
  call(byPath(invitationEndpoints, `/invitations/:id/${what}`), {
    as,
    params: { id },
  });

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
    },
  });

/** The invitations a sync of the account brings. */
const invitationsOf = async (as: string) => (await synced(as)).invitations;

/** The invitations kept, by address. */
const kept = () =>
  [...fake.db.invites.values()].map((doc) => String(doc.email)).sort();

const membersOf = (calendar: string) =>
  fake.get("calendars", calendar)?.members as string[];

/** An invitation as the database keeps it – made by hand, at any time. */
const putInvitation = (
  id: string,
  {
    email,
    calendar = FAMILY,
    by = ANNA,
    made = START,
  }: { email: string; calendar?: string; by?: string; made?: number }
) =>
  fake.put("invites", {
    id,
    email,
    calendar,
    invitedBy: by,
    token: `${id.slice(-8)}`.padStart(48, "f"),
    createdAt: new Date(made).toISOString(),
    expiresAt: new Date(made + 14 * DAY).toISOString(),
  });

describe("inviting", () => {
  it("answers the same for an account, an address without one and a member", async () => {
    const answers = [
      await invite(ANNA, "ben@example.com"),
      await invite(ANNA, " Nobody@Example.com "),
      await invite(ANNA, "carl@example.com"),
    ];
    for (const one of answers) {
      expect(one).toEqual({ status: 200, body: { invited: true } });
    }
    // Nobody is in – Carl was already.
    expect(membersOf(FAMILY)).toEqual([ANNA, CARL]);
    expect(fake.updates).toEqual([]);
    // An invitation and a mail each – none for the member.
    expect(kept()).toEqual(["ben@example.com", "nobody@example.com"]);
    expect(fake.sent.map((mail) => mail.to).sort()).toEqual([
      "ben@example.com",
      "nobody@example.com",
    ]);
  });

  it("tells the account at once – a push and a nudge, to it alone", async () => {
    await invite(ANNA, "ben@example.com");
    await invite(ANNA, "nobody@example.com");
    await invite(ANNA, "carl@example.com");
    expect(beside.told).toEqual([{ calendar: FAMILY, who: BEN, by: ANNA }]);
    expect(beside.nudged).toEqual([BEN]);
    expect(beside.nudgedCalendars).toEqual([]);
  });

  it("takes an address nobody confirmed for no account – a mail, nothing more", async () => {
    fake.account({ id: `acc-dora-${run}`, email: "dora@example.com" });
    Object.assign(fake.get("accounts", `acc-dora-${run}`) ?? {}, {
      _verified: false,
    });
    expect(await invite(ANNA, "dora@example.com")).toEqual({
      status: 200,
      body: { invited: true },
    });
    expect(kept()).toEqual(["dora@example.com"]);
    expect(beside.told).toEqual([]);
    expect(beside.nudged).toEqual([]);
  });

  it("is the owner's alone", async () => {
    expect((await invite(BEN, "ben@example.com")).status).toBe(403);
    expect((await invite(CARL, "ben@example.com")).status).toBe(403);
    expect(kept()).toEqual([]);
  });
});

describe("the invitations in the sync", () => {
  it("brings the account's own – the calendar's name and color, who, until when", async () => {
    await invite(ANNA, "ben@example.com");
    const [made] = fake.db.invites.values();
    expect(await invitationsOf(BEN)).toEqual([
      {
        id: String(made.id),
        calendar: "Familie",
        color: "sky",
        from: "Anna",
        expiresAt: new Date(START + 14 * DAY).toISOString(),
      },
    ]);
    // Nobody else's.
    expect(await invitationsOf(ANNA)).toEqual([]);
    expect(await invitationsOf(CARL)).toEqual([]);
  });

  it("never brings a token or an address – nor anything else of the calendar", async () => {
    await invite(ANNA, "ben@example.com");
    await invite(ANNA, "nobody@example.com");
    const sync = await synced(BEN);
    const told = JSON.stringify(sync);
    for (const doc of fake.db.invites.values()) {
      expect(told).not.toContain(String(doc.token));
    }
    expect(JSON.stringify(sync.invitations)).not.toMatch(/token|@/);
    // Its own address it knows; nobody else's – the sender's neither.
    for (const theirs of ["anna@", "nobody@", "carl@", CARL]) {
      expect(told).not.toContain(theirs);
    }
    expect(sync.calendarIds).toEqual([]);
    expect(sync.calendars).toEqual([]);
  });

  it("goes by the confirmed address – not one still waiting for its link", async () => {
    Object.assign(fake.get("accounts", BEN) ?? {}, {
      pendingEmail: "ben.neu@example.com",
      pendingEmailExpiresAt: new Date(START + DAY).toISOString(),
    });
    await invite(ANNA, "ben.neu@example.com");
    expect(await invitationsOf(BEN)).toEqual([]);
  });

  it("brings the open ones, oldest first – not one that is over, to a calendar gone, or to one it is in", async () => {
    putInvitation("a".repeat(24), { email: "ben@example.com" });
    putInvitation("b".repeat(24), {
      email: "ben@example.com",
      calendar: SPORT,
      by: CARL,
      made: START - DAY,
    });
    // Over, to a deleted calendar, to one Ben is in by now.
    putInvitation("c".repeat(24), {
      email: "ben@example.com",
      made: START - 15 * DAY,
    });
    fake.put("calendars", {
      id: "gone",
      name: "Weg",
      owner: ANNA,
      members: [ANNA],
      deleted: true,
    });
    putInvitation("d".repeat(24), {
      email: "ben@example.com",
      calendar: "gone",
    });
    fake.put("calendars", {
      id: "in",
      name: "Drin",
      owner: CARL,
      members: [CARL, BEN],
      deleted: false,
    });
    putInvitation("e".repeat(24), {
      email: "ben@example.com",
      calendar: "in",
      by: CARL,
    });
    const open = await invitationsOf(BEN);
    expect(open?.map((one) => [one.id, one.calendar, one.from])).toEqual([
      ["b".repeat(24), "Sport", "Carl"],
      ["a".repeat(24), "Familie", "Anna"],
    ]);
  });
});

describe("taking one up", () => {
  it("makes the account a member – the others hear of it, the invitation goes", async () => {
    await invite(ANNA, "ben@example.com");
    const [{ id }] = (await invitationsOf(BEN)) ?? [];
    expect(await answer(BEN, id, "accept")).toEqual({
      status: 200,
      body: { calendar: FAMILY },
    });
    expect(membersOf(FAMILY)).toEqual([ANNA, CARL, BEN]);
    // Who came in is who did it – for the others' “changed” (push).
    expect(fake.updates).toMatchObject([
      { collection: "calendars", id: FAMILY, context: { sync: true, by: BEN } },
    ]);
    expect(beside.nudgedCalendars).toEqual([FAMILY]);
    expect(kept()).toEqual([]);
    const after = await synced(BEN);
    expect(after.invitations).toEqual([]);
    expect(after.calendarIds).toEqual([FAMILY]);
  });

  it("is the account's own only – another's is not found", async () => {
    await invite(ANNA, "ben@example.com");
    const [{ id }] = (await invitationsOf(BEN)) ?? [];
    expect((await answer(CARL, id, "accept")).status).toBe(404);
    expect((await answer(ANNA, id, "accept")).status).toBe(404);
    expect((await answer("", id, "accept")).status).toBe(401);
    for (const nonsense of ["", "x", "f".repeat(48), `${id}0`]) {
      expect((await answer(BEN, nonsense, "accept")).status).toBe(404);
    }
    expect(membersOf(FAMILY)).toEqual([ANNA, CARL]);
    expect(kept()).toEqual(["ben@example.com"]);
  });

  it("is too late once it is over – said as such", async () => {
    await invite(ANNA, "ben@example.com");
    const [{ id }] = (await invitationsOf(BEN)) ?? [];
    vi.setSystemTime(START + 14 * DAY);
    expect(await answer(BEN, id, "accept")).toMatchObject({
      status: 410,
      body: { expired: true },
    });
    expect(membersOf(FAMILY)).toEqual([ANNA, CARL]);
    expect(await invitationsOf(BEN)).toEqual([]);
  });

  it("works once", async () => {
    await invite(ANNA, "ben@example.com");
    const [{ id }] = (await invitationsOf(BEN)) ?? [];
    await answer(BEN, id, "accept");
    fake.updates.length = 0;
    expect((await answer(BEN, id, "accept")).status).toBe(404);
    expect((await answer(BEN, id, "decline")).status).toBe(404);
    expect(fake.updates).toEqual([]);
    expect(membersOf(FAMILY)).toEqual([ANNA, CARL, BEN]);
  });

  it("is no more once the calendar is gone", async () => {
    await invite(ANNA, "ben@example.com");
    const [{ id }] = (await invitationsOf(BEN)) ?? [];
    Object.assign(fake.get("calendars", FAMILY) ?? {}, { deleted: true });
    expect((await answer(BEN, id, "accept")).status).toBe(404);
    expect(kept()).toEqual([]);
  });
});

describe("turning one down", () => {
  it("takes the invitation away – and nothing else", async () => {
    await invite(ANNA, "ben@example.com");
    const [{ id }] = (await invitationsOf(BEN)) ?? [];
    beside.nudged.length = 0;
    expect(await answer(BEN, id, "decline")).toEqual({
      status: 200,
      body: { declined: true },
    });
    expect(membersOf(FAMILY)).toEqual([ANNA, CARL]);
    expect(fake.updates).toEqual([]);
    expect(kept()).toEqual([]);
    // Its other devices drop it; nobody else hears a thing.
    expect(beside.nudged).toEqual([BEN]);
    expect(beside.nudgedCalendars).toEqual([]);
    // The owner merely no longer sees it waiting.
    const owners = await call(byPath(inviteEndpoints, "/:id/invites", "get"), {
      as: ANNA,
      params: { id: FAMILY },
    });
    expect(owners.body).toEqual({ invites: [] });
  });

  it("is the account's own only, while it lasts, and once", async () => {
    await invite(ANNA, "ben@example.com");
    const [{ id }] = (await invitationsOf(BEN)) ?? [];
    expect((await answer(CARL, id, "decline")).status).toBe(404);
    expect(kept()).toEqual(["ben@example.com"]);
    vi.setSystemTime(START + 15 * DAY);
    expect((await answer(BEN, id, "decline")).status).toBe(410);
    vi.setSystemTime(START);
    expect((await answer(BEN, id, "decline")).status).toBe(200);
    expect((await answer(BEN, id, "decline")).status).toBe(404);
  });
});

describe("logging in", () => {
  it("joins nothing – the invitation waits in the app", async () => {
    await invite(ANNA, "ben@example.com");
    const login = await call(byPath(sessionEndpoints, "/login"), {
      body: { email: "ben@example.com", password: "geheim-123" },
    });
    expect(login.status).toBe(200);
    expect(membersOf(FAMILY)).toEqual([ANNA, CARL]);
    expect(kept()).toEqual(["ben@example.com"]);
    expect(await invitationsOf(BEN)).toHaveLength(1);
  });
});

describe("the mail's link", () => {
  /** The token in the link of the mail to an address. */
  const tokenTo = (email: string) =>
    /invite\?token=([0-9a-f]{48})/.exec(
      fake.sent.find((mail) => mail.to === email)?.html ?? ""
    )?.[1] ?? "";

  const follow = (as: string, token: string) =>
    call(byPath(Invites.endpoints || [], "/:token/accept"), {
      as,
      params: { token },
    });

  it("is a yes: whoever follows it, logged in, joins that calendar", async () => {
    await invite(ANNA, "ben@example.com");
    expect(await follow(BEN, tokenTo("ben@example.com"))).toEqual({
      status: 200,
      body: { calendar: FAMILY },
    });
    expect(membersOf(FAMILY)).toEqual([ANNA, CARL, BEN]);
    expect(fake.updates).toMatchObject([{ context: { by: BEN } }]);
    expect(kept()).toEqual([]);
    expect(await invitationsOf(BEN)).toEqual([]);
  });

  it("takes the one in the app along – sent to another address of the same person", async () => {
    await invite(ANNA, "ben@example.com");
    await invite(ANNA, "ben.privat@example.com");
    await invite(ANNA, "nobody@example.com");
    await follow(BEN, tokenTo("ben.privat@example.com"));
    expect(membersOf(FAMILY)).toEqual([ANNA, CARL, BEN]);
    // Its owner sees nobody waiting who is in.
    expect(kept()).toEqual(["nobody@example.com"]);
  });

  it("needs a login – and works once", async () => {
    await invite(ANNA, "ben@example.com");
    const token = tokenTo("ben@example.com");
    expect((await follow("", token)).status).toBe(401);
    expect(membersOf(FAMILY)).toEqual([ANNA, CARL]);
    await follow(BEN, token);
    expect((await follow(BEN, token)).status).toBe(404);
  });
});
