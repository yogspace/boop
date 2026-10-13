import { LockedAuth, type PayloadRequest } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenHash } from "../../src/features/accounts/email-change";
import {
  emailChangedMail,
  newEmailMail,
} from "../../src/features/accounts/emails";
import { sessionEndpoints } from "../../src/features/accounts/session";
import type { Locale } from "../../src/i18n/config";
import { fakeAccounts } from "./fake-accounts";

/**
 * The account's way to a new address, through its endpoints (session.ts):
 * who is let through, what is answered, which mail goes where. The accounts
 * are the fake's; the password check is the fake's login.
 */

// What the endpoints do beside the account – noted here.
const beside = vi.hoisted(() => ({
  nudged: [] as string[],
}));

// The app's paths (@/…), which the tests don't resolve – by their files.
vi.mock("@/i18n/config", () => import("../../src/i18n/config"));
vi.mock("@/lib/mail-layout", () => import("../../src/lib/mail-layout"));
vi.mock("@/lib/server-url", () => import("../../src/lib/server-url"));
vi.mock("@/lib/rate-limit", () => import("../../src/lib/rate-limit"));
vi.mock("@/features/translations/get-texts", async () => {
  const { dictionaryOf } = await import("../../src/i18n/dictionaries");
  return { getDictionary: async (locale: Locale) => dictionaryOf(locale) };
});
vi.mock("@/features/sync/live", () => ({
  nudge: (accounts: string[]) => {
    beside.nudged.push(...accounts);
  },
}));

vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://boop.example");

const PASSWORD = "geheim-123";
const HOUR = 3_600_000;
const START = Date.parse("2026-10-13T10:00:00.000Z");

let fake: ReturnType<typeof fakeAccounts>;
// The brakes count per account, for as long as the server runs: every test
// gets accounts of its own.
let run = 0;
let ANNA = "";
let BEN = "";

beforeEach(() => {
  // Only the clock is the test's – the mails go out behind the answer.
  vi.useFakeTimers({ toFake: ["Date"], now: START });
  run++;
  ANNA = `acc-anna-${run}`;
  BEN = `acc-ben-${run}`;
  fake = fakeAccounts({ now: () => Date.now() });
  fake.put({ id: ANNA, email: "anna@example.com" });
  fake.put({ id: BEN, email: "ben@example.com", name: "Ben", locale: "en" });
  beside.nudged.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

type Answer = {
  status: number;
  body: Record<string, unknown> & { user?: Record<string, unknown> };
  cookies: string[];
};

/** Calls an endpoint – logged in as `as` (an account's id), or as nobody. */
const call = async (
  method: string,
  path: string,
  { as, body = {} }: { as?: string; body?: unknown } = {}
): Promise<Answer> => {
  const endpoint = sessionEndpoints.find(
    (one) => one.path === path && one.method === method
  );
  if (!endpoint) throw new Error(`No endpoint ${method} ${path}`);
  const response = await endpoint.handler({
    payload: fake.payload,
    headers: new Headers(),
    // Where `sessionAccount` keeps whom it found for the request.
    context: {
      sessionAccount: as ? { ...fake.get(as), collection: "accounts" } : null,
    },
    json: async () => body,
    user: null,
  } as unknown as PayloadRequest);
  return {
    status: response.status,
    body: await response.json(),
    cookies: response.headers.getSetCookie(),
  };
};

const ask = (as: string, email: unknown, password: unknown = PASSWORD) =>
  call("post", "/me/email", { as, body: { email, password } });

/** Lets the mails behind an answer go out. */
const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

/** The token in a mail's link. */
const tokenIn = (html: string) =>
  /change-email\?token=([0-9a-f]{48})/.exec(html)?.[1] ?? "";

/** Asks, and reads the token from the mail that went out. */
const asked = async (as: string, email: string) => {
  fake.sent.length = 0;
  await ask(as, email);
  await settle();
  const token = tokenIn(fake.sent[0]?.html ?? "");
  fake.sent.length = 0;
  return token;
};

describe("asking for a new address", () => {
  it("needs a login", async () => {
    const answer = await ask("", "neu@example.com");
    expect(answer.status).toBe(401);
    expect(fake.get(ANNA).pendingEmail).toBeUndefined();
  });

  it("needs the password – being logged in is not enough", async () => {
    for (const wrong of ["falsch", "", null, { $ne: "" }]) {
      const answer = await ask(ANNA, "neu@example.com", wrong);
      expect(answer.status, String(wrong)).toBe(403);
    }
    // None at all.
    const without = await call("post", "/me/email", {
      as: ANNA,
      body: { email: "neu@example.com" },
    });
    expect(without.status).toBe(403);
    await settle();
    expect(fake.get(ANNA).pendingEmail).toBeUndefined();
    expect(fake.sent).toEqual([]);
  });

  it("notes the address and answers with it – the old one stays", async () => {
    const answer = await ask(ANNA, " Anna.Neu@Example.com ");
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({
      user: {
        id: ANNA,
        collection: "accounts",
        name: "Anna",
        email: "anna@example.com",
        locale: "de",
        pendingEmail: "anna.neu@example.com",
        admin: false,
      },
    });
    expect(fake.get(ANNA)).toMatchObject({
      email: "anna@example.com",
      pendingEmail: "anna.neu@example.com",
      pendingEmailExpiresAt: new Date(START + 24 * HOUR).toISOString(),
    });
    // No login is made or ended by it.
    expect(answer.cookies).toEqual([]);
    // The account's other devices show it waiting, too.
    expect(beside.nudged).toEqual([ANNA]);
  });

  it("sends the link to the NEW address – in the account's language", async () => {
    await ask(BEN, "ben.new@example.com");
    await settle();
    expect(fake.sent).toHaveLength(1);
    const [mail] = fake.sent;
    const token = tokenIn(mail.html);
    expect(fake.get(BEN).pendingEmailToken).toBe(tokenHash(token));
    expect(mail).toEqual({
      to: "ben.new@example.com",
      ...(await newEmailMail({
        token,
        user: { name: "Ben", locale: "en" },
      })),
    });
    expect(mail.subject).toBe("Confirm your new address for Boop");
    expect(mail.html).toContain(
      `https://boop.example/en/change-email?token=${token}`
    );
  });

  it("never answers with the token – or its hash", async () => {
    const answer = await ask(ANNA, "anna.neu@example.com");
    await settle();
    const told = JSON.stringify(answer.body);
    expect(told).not.toContain(tokenIn(fake.sent[0].html));
    expect(told).not.toContain(String(fake.get(ANNA).pendingEmailToken));
    expect(told).not.toMatch(/token/i);
  });

  it("refuses the address it has, and what is none – kindly, with the reason", async () => {
    expect(await ask(ANNA, "ANNA@example.com")).toMatchObject({
      status: 400,
      body: { reason: "same" },
    });
    expect(await ask(ANNA, "anna@")).toMatchObject({
      status: 400,
      body: { reason: "invalid" },
    });
    await settle();
    expect(fake.get(ANNA).pendingEmail).toBeUndefined();
    expect(fake.sent).toEqual([]);
  });

  it("ends the login the password check made – the others stay", async () => {
    fake.get(ANNA).sessions = [{ id: "phone" }, { id: "laptop" }];
    await ask(ANNA, "anna.neu@example.com");
    expect(fake.get(ANNA).sessions).toEqual([
      { id: "phone" },
      { id: "laptop" },
    ]);
  });
});

describe("an address that is someone else's", () => {
  it("gets the same answer – and no mail goes anywhere", async () => {
    const free = await ask(ANNA, "frei@example.com");
    await settle();
    const freeKept = { ...fake.get(ANNA) };
    expect(fake.sent).toHaveLength(1);
    fake.sent.length = 0;

    const taken = await ask(ANNA, "ben@example.com");
    await settle();
    const takenKept = { ...fake.get(ANNA) };

    // Nothing tells them apart but the address that was asked for.
    expect(taken.status).toBe(free.status);
    expect(taken.cookies).toEqual(free.cookies);
    expect(taken.body).toEqual({
      user: { ...free.body.user, pendingEmail: "ben@example.com" },
    });
    expect(Object.keys(takenKept).sort()).toEqual(Object.keys(freeKept).sort());
    expect(takenKept.pendingEmailToken).toMatch(/^[0-9a-f]{64}$/);
    // Not to the account's address, not to the one asked for.
    expect(fake.sent).toEqual([]);
    expect(fake.warnings).toEqual([]);
  });

  it("shows as waiting like any other – in what “me” says", async () => {
    await ask(ANNA, "ben@example.com");
    const me = await call("get", "/me", { as: ANNA });
    expect(me.body.user?.pendingEmail).toBe("ben@example.com");
  });
});

describe("the brake on trying passwords", () => {
  it("stops after five tries in a quarter of an hour – the right one too", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await ask(ANNA, "neu@example.com", "falsch")).status).toBe(403);
    }
    expect((await ask(ANNA, "neu@example.com")).status).toBe(429);
    expect(fake.get(ANNA).pendingEmail).toBeUndefined();
    // Another account is not held up by it.
    expect((await ask(BEN, "ben.new@example.com")).status).toBe(200);
    // A quarter of an hour on, it goes again.
    vi.setSystemTime(START + 15 * 60_000);
    expect((await ask(ANNA, "neu@example.com")).status).toBe(200);
  });

  it("is the one of the delete button – tries there count here", async () => {
    for (let i = 0; i < 5; i++) {
      const answer = await call("delete", "/me", {
        as: ANNA,
        body: { password: "falsch" },
      });
      expect(answer.status).toBe(403);
    }
    expect((await ask(ANNA, "neu@example.com")).status).toBe(429);
    expect(fake.deleted).toEqual([]);
  });

  it("answers “too many” once the wrong ones locked the account", async () => {
    fake.payload.login = (async () => {
      throw new LockedAuth();
    }) as never;
    expect((await ask(ANNA, "neu@example.com")).status).toBe(429);
    expect(fake.get(ANNA).pendingEmail).toBeUndefined();
  });

  it("lets five addresses an hour be asked for – nobody's inbox is filled from here", async () => {
    // Five right away, then – the quarters of an hour apart – no more.
    for (let i = 0; i < 5; i++) {
      expect((await ask(ANNA, `neu${i}@example.com`)).status).toBe(200);
    }
    vi.setSystemTime(START + 20 * 60_000);
    expect((await ask(ANNA, "neu5@example.com")).status).toBe(429);
    expect(fake.get(ANNA).pendingEmail).toBe("neu4@example.com");
    await settle();
    expect(fake.sent).toHaveLength(5);
    vi.setSystemTime(START + 61 * 60_000);
    expect((await ask(ANNA, "neu5@example.com")).status).toBe(200);
  });
});

describe("taking it back", () => {
  it("needs a login – but no password", async () => {
    expect((await call("delete", "/me/email")).status).toBe(401);
  });

  it("clears what was noted – the link is dead", async () => {
    const token = await asked(ANNA, "anna.neu@example.com");
    beside.nudged.length = 0;
    const answer = await call("delete", "/me/email", { as: ANNA });
    expect(answer).toMatchObject({
      status: 200,
      body: { user: { email: "anna@example.com", pendingEmail: null } },
    });
    expect(fake.get(ANNA).pendingEmail).toBeNull();
    expect(beside.nudged).toEqual([ANNA]);
    expect(
      (await call("post", "/change-email", { body: { token } })).status
    ).toBe(404);
    expect(fake.get(ANNA).email).toBe("anna@example.com");
  });
});

describe("confirming", () => {
  it("needs no login – the link is the key", async () => {
    const token = await asked(ANNA, "anna.neu@example.com");
    const answer = await call("post", "/change-email", { body: { token } });
    expect(answer).toMatchObject({ status: 200, body: { ok: true } });
    expect(fake.get(ANNA)).toMatchObject({
      email: "anna.neu@example.com",
      pendingEmail: null,
      pendingEmailToken: null,
      pendingEmailExpiresAt: null,
    });
  });

  it("logs nobody in or out – and tells no one's address", async () => {
    fake.get(ANNA).sessions = [{ id: "phone" }];
    const token = await asked(ANNA, "anna.neu@example.com");
    const answer = await call("post", "/change-email", { body: { token } });
    expect(answer.cookies).toEqual([]);
    expect(answer.body).toEqual({ ok: true });
    expect(fake.get(ANNA).sessions).toEqual([{ id: "phone" }]);
  });

  it("tells the OLD address – without naming the new one", async () => {
    const token = await asked(BEN, "ben.new@example.com");
    await call("post", "/change-email", { body: { token } });
    await settle();
    expect(fake.sent).toEqual([
      {
        to: "ben@example.com",
        ...(await emailChangedMail({ user: { name: "Ben", locale: "en" } })),
      },
    ]);
    expect(fake.sent[0].subject).toBe("Your address at Boop was changed");
    expect(fake.sent[0].html).not.toContain("ben.new");
  });

  it("nudges the open apps – the invitations to the new address wait there for a yes", async () => {
    const token = await asked(ANNA, "anna.neu@example.com");
    beside.nudged.length = 0;
    await call("post", "/change-email", { body: { token } });
    expect(beside.nudged).toEqual([ANNA]);
  });

  it("works once", async () => {
    const token = await asked(ANNA, "anna.neu@example.com");
    await call("post", "/change-email", { body: { token } });
    await settle();
    fake.sent.length = 0;
    beside.nudged.length = 0;
    const again = await call("post", "/change-email", { body: { token } });
    await settle();
    expect(again).toMatchObject({ status: 404, body: { reason: "invalid" } });
    expect(fake.sent).toEqual([]);
    expect(beside.nudged).toEqual([]);
  });

  it("is over after 24 hours – said as such", async () => {
    const token = await asked(ANNA, "anna.neu@example.com");
    vi.setSystemTime(START + 24 * HOUR);
    const answer = await call("post", "/change-email", { body: { token } });
    await settle();
    expect(answer).toMatchObject({ status: 410, body: { reason: "expired" } });
    expect(fake.get(ANNA).email).toBe("anna@example.com");
    expect(fake.sent).toEqual([]);
    // And “me” no longer shows it waiting.
    const me = await call("get", "/me", { as: ANNA });
    expect(me.body.user?.pendingEmail).toBeNull();
  });

  it("says so when the address is someone else's by now", async () => {
    const token = await asked(ANNA, "carl@example.com");
    fake.put({ id: `acc-carl-${run}`, email: "carl@example.com" });
    const answer = await call("post", "/change-email", { body: { token } });
    await settle();
    expect(answer).toMatchObject({ status: 409, body: { reason: "taken" } });
    expect(fake.get(ANNA)).toMatchObject({
      email: "anna@example.com",
      pendingEmail: null,
    });
    expect(fake.sent).toEqual([]);
  });

  it("knows no link it didn't send", async () => {
    await asked(ANNA, "anna.neu@example.com");
    for (const token of ["f".repeat(48), "", undefined, { $ne: null }]) {
      const answer = await call("post", "/change-email", { body: { token } });
      expect(answer.status).toBe(404);
    }
    expect(fake.get(ANNA).email).toBe("anna@example.com");
  });
});

describe("what an account is told about itself", () => {
  it("names the address waiting and the admin's box – never the token, never “never delete”", async () => {
    await asked(ANNA, "anna.neu@example.com");
    Object.assign(fake.get(ANNA), { admin: true, neverDelete: true });
    const me = await call("get", "/me", { as: ANNA });
    expect(me.body).toEqual({
      user: {
        id: ANNA,
        collection: "accounts",
        name: "Anna",
        email: "anna@example.com",
        locale: "de",
        pendingEmail: "anna.neu@example.com",
        admin: true,
      },
    });
  });

  it("takes anything but a ticked box as none", async () => {
    for (const none of [undefined, null, false, "true", 1]) {
      fake.get(ANNA).admin = none;
      const me = await call("get", "/me", { as: ANNA });
      expect(me.body.user?.admin, String(none)).toBe(false);
    }
  });
});

describe("the account's own changes", () => {
  it("are its name and language – never the boxes, the address or anything else", async () => {
    let written: unknown;
    fake.payload.update = (async ({ data }: { data: object }) => {
      written = data;
      return { ...fake.get(ANNA), ...data };
    }) as never;
    const answer = await call("patch", "/me", {
      as: ANNA,
      body: {
        name: "  Anna B. ",
        locale: "en",
        admin: true,
        neverDelete: true,
        email: "anders@example.com",
        pendingEmail: "anders@example.com",
        _verified: true,
        password: "ein-neues-1",
      },
    });
    expect(answer.status).toBe(200);
    expect(written).toEqual({ name: "Anna B.", locale: "en" });
  });
});

describe("a new password", () => {
  it("drops an address that was waiting – whoever asked for it knew the old one", async () => {
    const token = await asked(ANNA, "anna.neu@example.com");
    fake.payload.resetPassword = (async () => ({
      token: "a-login-token",
      user: { ...fake.get(ANNA) },
    })) as never;
    const answer = await call("post", "/reset-password", {
      body: { token: "reset-token", password: "ein-neues-1" },
    });
    expect(answer).toMatchObject({
      status: 200,
      body: { user: { email: "anna@example.com", pendingEmail: null } },
    });
    expect(fake.get(ANNA)).toMatchObject({
      pendingEmail: null,
      pendingEmailToken: null,
      pendingEmailExpiresAt: null,
    });
    expect(
      (await call("post", "/change-email", { body: { token } })).status
    ).toBe(404);
  });
});
