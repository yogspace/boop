import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCleanup } from "../../src/features/accounts/cleanup";
import { askEmailChange } from "../../src/features/accounts/email-change";
import type { Locale } from "../../src/i18n/config";
import { fakeAccounts } from "./fake-accounts";

/**
 * One run of the daily cleanup over accounts in memory (cleanup.ts) – what
 * it asks the database for, and what it then does: the rules themselves are
 * retention.test.ts's.
 */

const mails = vi.hoisted(() => [] as { to: string; subject: string }[]);

// The app's paths (@/…), which the tests don't resolve – by their files;
// invitations and calendar feeds are someone else's to sweep.
vi.mock("@/i18n/config", () => import("../../src/i18n/config"));
vi.mock("@/lib/mail-layout", () => import("../../src/lib/mail-layout"));
vi.mock("@/lib/server-url", () => import("../../src/lib/server-url"));
vi.mock("@/features/translations/get-texts", async () => {
  const { dictionaryOf } = await import("../../src/i18n/dictionaries");
  return { getDictionary: async (locale: Locale) => dictionaryOf(locale) };
});
vi.mock(
  "@/features/calendar/invite-expiry",
  () => import("../../src/features/calendar/invite-expiry")
);
vi.mock("@/features/calendar/invites", () => ({ sweepInvites: async () => 0 }));
vi.mock("@/features/ical/store", () => ({ sweepFeeds: async () => 0 }));
vi.mock("@/lib/mail", () => ({
  sendMail: async (mail: { to: string; subject: string }) => {
    mails.push(mail);
    return { ok: true };
  },
}));

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-13T06:00:00.000Z");
const iso = (time: number) => new Date(time).toISOString();
/** So many months ago, same day and time. */
const monthsAgo = (months: number) => {
  const date = new Date(NOW);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.getTime();
};

const signedUp = iso(NOW - 40 * DAY);
const away = iso(monthsAgo(26));
const warned = iso(NOW - 40 * DAY);

let fake: ReturnType<typeof fakeAccounts>;

beforeEach(() => {
  mails.length = 0;
  fake = fakeAccounts({ now: () => NOW });
  // Never confirmed, 40 days old.
  fake.put({
    id: "signup",
    email: "signup@example.com",
    _verified: false,
    createdAt: signedUp,
  });
  // Away for 26 months – warned 40 days ago, and still away.
  fake.put({
    id: "unused",
    email: "unused@example.com",
    lastSeenAt: away,
    deletionWarnedAt: warned,
  });
  // Away as long, but not warned yet.
  fake.put({ id: "quiet", email: "quiet@example.com", lastSeenAt: away });
  // The same three – marked “never delete”.
  fake.put({
    id: "kept-signup",
    email: "kept-signup@example.com",
    _verified: false,
    createdAt: signedUp,
    neverDelete: true,
  });
  fake.put({
    id: "kept-unused",
    email: "kept-unused@example.com",
    lastSeenAt: away,
    deletionWarnedAt: warned,
    neverDelete: true,
  });
  fake.put({
    id: "kept-quiet",
    email: "kept-quiet@example.com",
    lastSeenAt: away,
    neverDelete: true,
  });
  // There yesterday.
  fake.put({
    id: "here",
    email: "here@example.com",
    lastSeenAt: iso(NOW - DAY),
  });
});

const snapshot = () =>
  Object.fromEntries(
    [...fake.accounts].map(([id, doc]) => [id, structuredClone(doc)])
  );

describe("a run of the cleanup", () => {
  it("deletes and warns the ones that are due – never one marked “never delete”", async () => {
    const before = snapshot();
    const result = await runCleanup(fake.payload, { now: NOW });
    expect(result).toMatchObject({
      dry: false,
      unverified: { deleted: 1, failed: 0, left: 0 },
      inactive: { warned: 1, deleted: 1, noted: 0, reset: 0, failed: 0 },
    });
    expect(fake.deleted.sort()).toEqual(["signup", "unused"]);
    expect(mails.map((mail) => mail.to)).toEqual(["quiet@example.com"]);
    expect(fake.get("quiet").deletionWarnedAt).toBe(iso(NOW));
    // The marked ones: still there, not a field of them touched.
    for (const id of ["kept-signup", "kept-unused", "kept-quiet", "here"]) {
      expect(fake.get(id), id).toEqual(before[id]);
    }
  });

  it("doesn't list them when dry either – and changes nothing", async () => {
    const before = snapshot();
    const result = await runCleanup(fake.payload, { now: NOW, dry: true });
    expect(result).toMatchObject({
      dry: true,
      unverified: { deleted: 1, failed: 0, left: 0 },
      inactive: {
        noted: 0,
        reset: 0,
        warned: 1,
        mailFailed: 0,
        deleted: 1,
        left: 0,
        failed: 0,
      },
    });
    expect(snapshot()).toEqual(before);
    expect(fake.deleted).toEqual([]);
    expect(mails).toEqual([]);
  });

  it("leaves them alone for as long as the mark is there – day after day", async () => {
    for (let day = 0; day < 90; day++) {
      await runCleanup(fake.payload, { now: NOW + day * DAY });
    }
    expect([...fake.accounts.keys()].sort()).toEqual([
      "here",
      "kept-quiet",
      "kept-signup",
      "kept-unused",
    ]);
    expect(mails.map((mail) => mail.to)).toEqual(["quiet@example.com"]);
  });

  it("takes them up again once the mark is gone – with a new warning first", async () => {
    // As the admin's tick does it: the standing warning goes with it.
    Object.assign(fake.get("kept-unused"), {
      neverDelete: false,
      deletionWarnedAt: null,
    });
    await runCleanup(fake.payload, { now: NOW });
    expect(fake.deleted).not.toContain("kept-unused");
    expect(mails.map((mail) => mail.to).sort()).toEqual([
      "kept-unused@example.com",
      "quiet@example.com",
    ]);
  });
});

describe("a new address nobody confirmed", () => {
  it("is swept once its day is over – the account stays, marked or not", async () => {
    for (const id of ["here", "kept-quiet"]) {
      await askEmailChange(
        fake.payload,
        { id, email: fake.get(id).email },
        `${id}.neu@example.com`,
        NOW - 25 * 3_600_000
      );
    }
    // Asked an hour ago: still open.
    await askEmailChange(
      fake.payload,
      { id: "quiet", email: "quiet@example.com" },
      "quiet.neu@example.com",
      NOW - 3_600_000
    );

    const dry = await runCleanup(fake.payload, { now: NOW, dry: true });
    expect(dry.emailChanges).toBe(2);
    expect(fake.get("here").pendingEmail).toBe("here.neu@example.com");

    const result = await runCleanup(fake.payload, { now: NOW });
    expect(result.emailChanges).toBe(2);
    for (const id of ["here", "kept-quiet"]) {
      expect(fake.get(id)).toMatchObject({
        email: `${id}@example.com`,
        pendingEmail: null,
        pendingEmailToken: null,
        pendingEmailExpiresAt: null,
      });
    }
    expect(fake.get("quiet").pendingEmail).toBe("quiet.neu@example.com");
  });
});
