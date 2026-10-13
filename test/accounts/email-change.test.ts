import { beforeEach, describe, expect, it } from "vitest";
import {
  askEmailChange,
  cleanEmail,
  confirmEmailChange,
  dropEmailChange,
  sweepEmailChanges,
  tokenHash,
} from "../../src/features/accounts/email-change";
import {
  EMAIL_CHANGE_HOURS,
  emailChangeUntil,
  expiredEmailChanges,
  pendingEmailOf,
} from "../../src/features/accounts/retention";
import { fakeAccounts } from "./fake-accounts";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-10-13T10:00:00.000Z");
const iso = (time: number) => new Date(time).toISOString();

const ANNA = "acc-anna";
const BEN = "acc-ben";

let fake: ReturnType<typeof fakeAccounts>;

beforeEach(() => {
  fake = fakeAccounts({ now: () => NOW });
  fake.put({ id: ANNA, email: "anna@example.com" });
  fake.put({ id: BEN, email: "ben@example.com", name: "Ben", locale: "en" });
});

const anna = () => ({ id: ANNA, email: String(fake.get(ANNA).email) });

/** Asks, and hands over the token – there has to be one. */
const ask = async (wanted: string, now = NOW) => {
  const asked = await askEmailChange(fake.payload, anna(), wanted, now);
  if (!(asked.ok && asked.token)) throw new Error("No token.");
  return asked.token;
};

describe("an address", () => {
  it("is kept trimmed and in lower case, as accounts keep theirs", () => {
    expect(cleanEmail("  Anna.B+boop@Example.COM ")).toBe(
      "anna.b+boop@example.com"
    );
  });

  it("is none without a name, a host or an ending – or as anything but text", () => {
    for (const none of [
      "",
      "anna",
      "anna@",
      "@example.com",
      "anna@example",
      "anna @example.com",
      "anna..b@example.com",
      "anna@-example.com",
      `${"a".repeat(250)}@example.com`,
      null,
      undefined,
      7,
      ["anna@example.com"],
    ]) {
      expect(cleanEmail(none), String(none)).toBeNull();
    }
  });
});

describe("how long a new address waits", () => {
  it("is 24 hours", () => {
    expect(EMAIL_CHANGE_HOURS).toBe(24);
    expect(emailChangeUntil(NOW)).toEqual(new Date(NOW + 24 * HOUR));
  });

  it("counts until the deadline – and is none from that moment", () => {
    const waiting = {
      pendingEmail: "neu@example.com",
      pendingEmailExpiresAt: iso(NOW + 24 * HOUR),
    };
    expect(pendingEmailOf(waiting, NOW)).toBe("neu@example.com");
    expect(pendingEmailOf(waiting, NOW + 24 * HOUR - 1)).toBe(
      "neu@example.com"
    );
    expect(pendingEmailOf(waiting, NOW + 24 * HOUR)).toBeNull();
    expect(pendingEmailOf(waiting, NOW + 30 * 24 * HOUR)).toBeNull();
  });

  it("is none where nothing is noted – or it can't say until when", () => {
    expect(pendingEmailOf({}, NOW)).toBeNull();
    expect(pendingEmailOf({ pendingEmail: "neu@example.com" }, NOW)).toBeNull();
    expect(
      pendingEmailOf(
        { pendingEmail: "neu@example.com", pendingEmailExpiresAt: "soon" },
        NOW
      )
    ).toBeNull();
    expect(
      pendingEmailOf(
        { pendingEmail: null, pendingEmailExpiresAt: iso(NOW + HOUR) },
        NOW
      )
    ).toBeNull();
  });

  it("reads dates as the database hands them over, too", () => {
    expect(
      pendingEmailOf(
        {
          pendingEmail: "neu@example.com",
          pendingEmailExpiresAt: new Date(NOW + HOUR),
        },
        NOW
      )
    ).toBe("neu@example.com");
  });

  it("is swept exactly when it no longer counts", () => {
    const until = iso(NOW + 24 * HOUR);
    const waiting = {
      pendingEmail: "neu@example.com",
      pendingEmailExpiresAt: until,
    };
    for (const now of [
      NOW,
      NOW + 24 * HOUR - 1,
      NOW + 24 * HOUR,
      NOW + 25 * HOUR,
    ]) {
      const swept =
        until <= expiredEmailChanges(now).pendingEmailExpiresAt.less_than_equal;
      expect(swept).toBe(pendingEmailOf(waiting, now) === null);
    }
  });
});

describe("asking for a new address", () => {
  it("notes it on the account – the old one stays", async () => {
    const asked = await askEmailChange(
      fake.payload,
      anna(),
      " Anna.Neu@Example.com ",
      NOW
    );
    expect(asked).toMatchObject({
      ok: true,
      pendingEmail: "anna.neu@example.com",
    });
    expect(fake.get(ANNA)).toMatchObject({
      email: "anna@example.com",
      pendingEmail: "anna.neu@example.com",
      pendingEmailExpiresAt: iso(NOW + 24 * HOUR),
    });
  });

  it("keeps only the token's hash – the token is the mail's", async () => {
    const token = await ask("anna.neu@example.com");
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    const kept = fake.get(ANNA).pendingEmailToken;
    expect(kept).toBe(tokenHash(token));
    expect(kept).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(fake.get(ANNA))).not.toContain(token);
  });

  it("makes a new token every time", async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 20; i++) tokens.add(await ask("anna.neu@example.com"));
    expect(tokens.size).toBe(20);
  });

  it("refuses the address the account has – however it is written", async () => {
    for (const same of ["anna@example.com", " ANNA@Example.com "]) {
      expect(await askEmailChange(fake.payload, anna(), same, NOW)).toEqual({
        ok: false,
        reason: "same",
      });
    }
    expect(fake.get(ANNA).pendingEmail).toBeUndefined();
  });

  it("refuses what is no address", async () => {
    for (const none of ["anna", "", null, { $ne: "" }]) {
      expect(await askEmailChange(fake.payload, anna(), none, NOW)).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    expect(fake.get(ANNA).pendingEmail).toBeUndefined();
  });

  it("puts a newer wish in place of an older one – whose link is dead", async () => {
    const first = await ask("erste@example.com");
    const second = await ask("zweite@example.com");
    expect(fake.get(ANNA).pendingEmail).toBe("zweite@example.com");
    expect(await confirmEmailChange(fake.payload, first, NOW)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await confirmEmailChange(fake.payload, second, NOW)).toMatchObject({
      ok: true,
    });
  });
});

describe("an address that is someone else's", () => {
  it("is answered and noted like any other – only without a token to mail", async () => {
    const free = await askEmailChange(
      fake.payload,
      anna(),
      "frei@example.com",
      NOW
    );
    const freeKept = { ...fake.get(ANNA) };
    const taken = await askEmailChange(
      fake.payload,
      anna(),
      "ben@example.com",
      NOW
    );
    const takenKept = { ...fake.get(ANNA) };

    expect(free).toMatchObject({ ok: true, pendingEmail: "frei@example.com" });
    expect(taken).toEqual({
      ok: true,
      pendingEmail: "ben@example.com",
      token: null,
    });
    // The account looks the same after either – an address, a hash, a date.
    expect(Object.keys(takenKept).sort()).toEqual(Object.keys(freeKept).sort());
    expect(takenKept.pendingEmailToken).toMatch(/^[0-9a-f]{64}$/);
    expect(takenKept.pendingEmailExpiresAt).toBe(
      freeKept.pendingEmailExpiresAt
    );
    expect(pendingEmailOf(takenKept, NOW)).toBe("ben@example.com");
  });

  it("is so with a sign-up nobody confirmed, too", async () => {
    fake.put({ id: "acc-neu", email: "neu@example.com", _verified: false });
    expect(
      await askEmailChange(fake.payload, anna(), "neu@example.com", NOW)
    ).toEqual({ ok: true, pendingEmail: "neu@example.com", token: null });
  });

  it("never becomes the account's – nobody has the token", async () => {
    await askEmailChange(fake.payload, anna(), "ben@example.com", NOW);
    // Not even the hash that is kept opens it.
    const kept = String(fake.get(ANNA).pendingEmailToken);
    for (const guess of [kept, kept.slice(0, 48), "0".repeat(48)]) {
      expect(await confirmEmailChange(fake.payload, guess, NOW)).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    expect(fake.get(ANNA).email).toBe("anna@example.com");
    expect(fake.get(BEN).email).toBe("ben@example.com");
  });
});

describe("confirming a new address", () => {
  it("makes it the account's – and tells whom to tell", async () => {
    const token = await ask("anna.neu@example.com");
    expect(await confirmEmailChange(fake.payload, token, NOW + HOUR)).toEqual({
      ok: true,
      account: {
        id: ANNA,
        email: "anna.neu@example.com",
        name: "Anna",
        locale: "de",
      },
      was: "anna@example.com",
    });
    expect(fake.get(ANNA).email).toBe("anna.neu@example.com");
  });

  it("clears what was noted – and a reset link on its way to the old address", async () => {
    Object.assign(fake.get(ANNA), {
      resetPasswordToken: "reset-token",
      resetPasswordExpiration: iso(NOW + HOUR),
    });
    await confirmEmailChange(
      fake.payload,
      await ask("anna.neu@example.com"),
      NOW
    );
    expect(fake.get(ANNA)).toMatchObject({
      pendingEmail: null,
      pendingEmailToken: null,
      pendingEmailExpiresAt: null,
      resetPasswordToken: null,
      resetPasswordExpiration: null,
    });
  });

  it("leaves the rest of the account as it was", async () => {
    Object.assign(fake.get(ANNA), {
      hash: "the-hash",
      salt: "the-salt",
      sessions: [{ id: "phone" }, { id: "laptop" }],
      neverDelete: true,
    });
    await confirmEmailChange(
      fake.payload,
      await ask("anna.neu@example.com"),
      NOW
    );
    expect(fake.get(ANNA)).toMatchObject({
      name: "Anna",
      locale: "de",
      _verified: true,
      hash: "the-hash",
      salt: "the-salt",
      // Logged in where it was – a login goes by the account, not the address.
      sessions: [{ id: "phone" }, { id: "laptop" }],
      neverDelete: true,
    });
  });

  it("works once – a second time the link is gone", async () => {
    const token = await ask("anna.neu@example.com");
    expect((await confirmEmailChange(fake.payload, token, NOW)).ok).toBe(true);
    expect(await confirmEmailChange(fake.payload, token, NOW)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(fake.get(ANNA).email).toBe("anna.neu@example.com");
  });

  it("works until the deadline – from then on it is too late", async () => {
    const late = await ask("spaet@example.com");
    expect(
      await confirmEmailChange(fake.payload, late, NOW + 24 * HOUR)
    ).toEqual({ ok: false, reason: "expired" });
    expect(fake.get(ANNA).email).toBe("anna@example.com");
    // Asked again: good for another day.
    const fresh = await ask("spaet@example.com", NOW + 24 * HOUR);
    expect(
      (await confirmEmailChange(fake.payload, fresh, NOW + 48 * HOUR - 1)).ok
    ).toBe(true);
  });

  it("knows no link it didn't make", async () => {
    await ask("anna.neu@example.com");
    for (const unknown of [
      "f".repeat(48),
      "",
      "anna.neu@example.com",
      null,
      undefined,
      { $ne: null },
      ["a"],
    ]) {
      expect(await confirmEmailChange(fake.payload, unknown, NOW)).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    expect(fake.get(ANNA).email).toBe("anna@example.com");
  });

  it("says so when the address became someone else's meanwhile – and forgets it", async () => {
    const token = await ask("carl@example.com");
    fake.put({ id: "acc-carl", email: "carl@example.com" });
    expect(await confirmEmailChange(fake.payload, token, NOW)).toEqual({
      ok: false,
      reason: "taken",
    });
    expect(fake.get(ANNA)).toMatchObject({
      email: "anna@example.com",
      pendingEmail: null,
      pendingEmailToken: null,
      pendingEmailExpiresAt: null,
    });
    // Nothing left to try again with.
    expect(await confirmEmailChange(fake.payload, token, NOW)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("says so, too, when it was taken in the very moment of confirming", async () => {
    const token = await ask("carl@example.com");
    // Free when looked at – taken when written: the database refuses.
    const count = fake.payload.count;
    fake.payload.count = (async (args: never) => {
      const result = await count(args);
      fake.put({ id: "acc-carl", email: "carl@example.com" });
      return result;
    }) as typeof count;
    expect(await confirmEmailChange(fake.payload, token, NOW)).toEqual({
      ok: false,
      reason: "taken",
    });
    expect(fake.get(ANNA)).toMatchObject({
      email: "anna@example.com",
      pendingEmail: null,
      pendingEmailToken: null,
    });
  });

  it("tells a second opener “used”, not “taken”, when the first was a moment quicker", async () => {
    const token = await ask("anna.neu@example.com");
    // Between the second one's two looks, the first goes all the way.
    const count = fake.payload.count;
    let first: Promise<unknown> | null = null;
    fake.payload.count = (async (args: never) => {
      if (!first) {
        first = confirmEmailChange(fake.payload, token, NOW);
        await first;
      }
      return count(args);
    }) as typeof count;
    expect(await confirmEmailChange(fake.payload, token, NOW)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(fake.get(ANNA).email).toBe("anna.neu@example.com");
  });

  it("lets only one of two at the same moment through", async () => {
    const token = await ask("anna.neu@example.com");
    const both = await Promise.all([
      confirmEmailChange(fake.payload, token, NOW),
      confirmEmailChange(fake.payload, token, NOW),
    ]);
    expect(both.filter((result) => result.ok)).toHaveLength(1);
    expect(both.find((result) => !result.ok)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("taking it back", () => {
  it("clears what was noted – the link is dead at once", async () => {
    const token = await ask("anna.neu@example.com");
    await dropEmailChange(fake.payload, ANNA);
    expect(fake.get(ANNA)).toMatchObject({
      email: "anna@example.com",
      pendingEmail: null,
      pendingEmailToken: null,
      pendingEmailExpiresAt: null,
    });
    expect(await confirmEmailChange(fake.payload, token, NOW)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("the cleanup's sweep", () => {
  it("takes the ones whose time is up – the accounts stay as they are", async () => {
    await ask("alt@example.com", NOW - 25 * HOUR);
    await askEmailChange(
      fake.payload,
      { id: BEN, email: "ben@example.com" },
      "ben.neu@example.com",
      NOW - HOUR
    );
    const stamp = "2026-09-01T08:00:00.000Z";
    fake.get(ANNA).updatedAt = stamp;

    expect(await sweepEmailChanges(fake.payload, { now: NOW })).toBe(1);
    expect(fake.get(ANNA)).toMatchObject({
      email: "anna@example.com",
      name: "Anna",
      pendingEmail: null,
      pendingEmailToken: null,
      pendingEmailExpiresAt: null,
      // Not the account's doing – its date of change stays.
      updatedAt: stamp,
    });
    // Ben's is still open.
    expect(fake.get(BEN).pendingEmail).toBe("ben.neu@example.com");
    expect(fake.accounts.size).toBe(2);
    expect(await sweepEmailChanges(fake.payload, { now: NOW })).toBe(0);
  });

  it("takes one at its deadline, not a moment before", async () => {
    await ask("neu@example.com");
    expect(
      await sweepEmailChanges(fake.payload, { now: NOW + 24 * HOUR - 1 })
    ).toBe(0);
    expect(
      await sweepEmailChanges(fake.payload, { now: NOW + 24 * HOUR })
    ).toBe(1);
  });

  it("only counts when dry", async () => {
    const token = await ask("alt@example.com", NOW - 25 * HOUR);
    expect(await sweepEmailChanges(fake.payload, { now: NOW, dry: true })).toBe(
      1
    );
    expect(fake.get(ANNA)).toMatchObject({
      pendingEmail: "alt@example.com",
      pendingEmailToken: tokenHash(token),
    });
  });

  it("leaves accounts alone that never asked", async () => {
    expect(await sweepEmailChanges(fake.payload, { now: NOW })).toBe(0);
    expect(fake.get(ANNA).pendingEmail).toBeUndefined();
  });
});
