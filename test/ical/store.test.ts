import { beforeEach, describe, expect, it } from "vitest";
import type { FeedWords } from "../../src/features/ical/rules";
import {
  dropFeed,
  feedOf,
  makeFeed,
  noteFetched,
  openFeed,
  renewFeed,
  sweepFeeds,
  textOf,
} from "../../src/features/ical/store";
import { fakePayload } from "./fake-payload";

const HOME = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const ANNAS = "9a8b7c6d-5e4f-4321-8765-0fedcba98765";
const ME = "acc-me";
const ANNA = "acc-anna";

const DE: FeedWords = {
  stamp: "Stempel",
  stamps: "Stempel",
  calendar: "Kalender",
};

let fake: ReturnType<typeof fakePayload>;

beforeEach(() => {
  fake = fakePayload();
  fake.put("accounts", { id: ME, name: "Max", locale: "en" });
  fake.put("accounts", { id: ANNA, name: "Anna", locale: "de" });
  fake.put("calendars", {
    id: HOME,
    name: "Familie",
    owner: ME,
    members: [ME, ANNA],
    deleted: false,
  });
  fake.put("calendars", {
    id: ANNAS,
    name: "Annas",
    owner: ANNA,
    members: [ANNA, ME],
    deleted: false,
  });
});

/** The calendar loses a member – left, or taken out. */
const leave = (calendar: string, account: string) => {
  const doc = fake.db.calendars.get(calendar) ?? {};
  fake.put("calendars", {
    ...doc,
    members: (doc.members as string[]).filter((id) => id !== account),
  });
};

describe("making an address", () => {
  it("makes one per account and calendar – with a key", async () => {
    const feed = await makeFeed(fake.payload, ME, HOME);
    expect(feed).toMatchObject({ account: ME, calendar: HOME });
    expect(feed.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(await feedOf(fake.payload, ME, HOME)).toEqual(feed);
    expect(await feedOf(fake.payload, ANNA, HOME)).toBeNull();
    expect(await feedOf(fake.payload, ME, ANNAS)).toBeNull();
  });

  it("opens the calendar, in the account's language", async () => {
    const feed = await makeFeed(fake.payload, ME, HOME);
    expect(await openFeed(fake.payload, feed.token)).toEqual({
      feed,
      calendar: { id: HOME, name: "Familie" },
      locale: "en",
    });
  });

  it("keeps each account's own: Anna's is another one", async () => {
    const mine = await makeFeed(fake.payload, ME, HOME);
    const annas = await makeFeed(fake.payload, ANNA, HOME);
    expect(annas.token).not.toBe(mine.token);
    expect((await openFeed(fake.payload, annas.token))?.locale).toBe("de");
    expect((await openFeed(fake.payload, mine.token))?.feed.account).toBe(ME);
  });
});

describe("a new address", () => {
  it("kills the old one at once", async () => {
    const old = await makeFeed(fake.payload, ME, HOME);
    const annas = await makeFeed(fake.payload, ANNA, HOME);
    const renewed = await renewFeed(fake.payload, ME, HOME);
    expect(renewed.token).not.toBe(old.token);
    expect(await openFeed(fake.payload, old.token)).toBeNull();
    expect(await openFeed(fake.payload, renewed.token)).not.toBeNull();
    expect(await feedOf(fake.payload, ME, HOME)).toEqual(renewed);
    // Anna's own stays as it was.
    expect(await openFeed(fake.payload, annas.token)).not.toBeNull();
    expect(fake.db["calendar-feeds"].size).toBe(2);
  });
});

describe("taking it back", () => {
  it("kills the address – and leaves the others alone", async () => {
    const mine = await makeFeed(fake.payload, ME, HOME);
    const other = await makeFeed(fake.payload, ME, ANNAS);
    const annas = await makeFeed(fake.payload, ANNA, HOME);
    await dropFeed(fake.payload, ME, HOME);
    expect(await openFeed(fake.payload, mine.token)).toBeNull();
    expect(await feedOf(fake.payload, ME, HOME)).toBeNull();
    expect(await openFeed(fake.payload, other.token)).not.toBeNull();
    expect(await openFeed(fake.payload, annas.token)).not.toBeNull();
  });
});

describe("a feed is good only for members", () => {
  it("dies when its account leaves the calendar – and goes", async () => {
    const feed = await makeFeed(fake.payload, ME, ANNAS);
    leave(ANNAS, ME);
    expect(await openFeed(fake.payload, feed.token)).toBeNull();
    expect(fake.db["calendar-feeds"].size).toBe(0);
  });

  it("stays dead when the account comes back – a new one is needed", async () => {
    const feed = await makeFeed(fake.payload, ME, ANNAS);
    leave(ANNAS, ME);
    await openFeed(fake.payload, feed.token);
    fake.put("calendars", {
      ...fake.db.calendars.get(ANNAS),
      members: [ANNA, ME],
    });
    expect(await openFeed(fake.payload, feed.token)).toBeNull();
  });

  it("dies with its calendar", async () => {
    const feed = await makeFeed(fake.payload, ME, HOME);
    fake.put("calendars", {
      id: HOME,
      name: "–",
      members: [],
      deleted: true,
    });
    expect(await openFeed(fake.payload, feed.token)).toBeNull();
  });

  it("dies with its account", async () => {
    const feed = await makeFeed(fake.payload, ME, HOME);
    fake.db.accounts.delete(ME);
    expect(await openFeed(fake.payload, feed.token)).toBeNull();
  });

  it("dies when the calendar is gone altogether", async () => {
    const feed = await makeFeed(fake.payload, ME, HOME);
    fake.db.calendars.delete(HOME);
    expect(await openFeed(fake.payload, feed.token)).toBeNull();
  });
});

describe("an unknown address", () => {
  it("is none – whatever the reason", async () => {
    expect(await openFeed(fake.payload, "A".repeat(32))).toBeNull();
  });

  it("never asks the database for what isn't shaped like a key", async () => {
    await makeFeed(fake.payload, ME, HOME);
    const asked = fake.calls.find;
    for (const token of ["", "x", "../calendars", { $ne: null }, null]) {
      expect(await openFeed(fake.payload, token)).toBeNull();
    }
    expect(fake.calls.find).toBe(asked);
  });
});

describe("sweeping", () => {
  it("takes away the feeds of accounts no longer in their calendar", async () => {
    const stays = await makeFeed(fake.payload, ANNA, HOME);
    await makeFeed(fake.payload, ME, ANNAS);
    await makeFeed(fake.payload, ME, HOME);
    leave(ANNAS, ME);
    fake.put("calendars", { id: HOME, members: [ANNA], deleted: false });
    expect(await sweepFeeds(fake.payload)).toBe(2);
    expect([...fake.db["calendar-feeds"].values()]).toEqual([
      expect.objectContaining({ token: stays.token }),
    ]);
    expect(await sweepFeeds(fake.payload)).toBe(0);
  });

  it("has nothing to do without feeds", async () => {
    expect(await sweepFeeds(fake.payload)).toBe(0);
  });
});

describe("noting a fetch", () => {
  it("writes once a day at most", async () => {
    const feed = await makeFeed(fake.payload, ME, HOME);
    const morning = new Date("2026-10-12T08:00:00.000Z");
    await noteFetched(fake.payload, feed, morning);
    expect(fake.calls.update).toBe(1);
    const noted = (await feedOf(fake.payload, ME, HOME)) ?? feed;
    expect(noted.lastFetchedAt).toBe(morning.toISOString());
    await noteFetched(
      fake.payload,
      noted,
      new Date("2026-10-12T21:00:00.000Z")
    );
    expect(fake.calls.update).toBe(1);
    await noteFetched(
      fake.payload,
      noted,
      new Date("2026-10-13T06:00:00.000Z")
    );
    expect(fake.calls.update).toBe(2);
  });
});

describe("the calendar's text from the database", () => {
  it("is made of this calendar's prints, notes and stamp names alone", async () => {
    fake.put("stamps", { id: "sport", name: "Sport", drawing: { secret: 1 } });
    fake.put("stamps", { id: "annas", name: "Wolke" });
    fake.put("placements", {
      id: "p1",
      calendar: HOME,
      date: "2026-10-12",
      stamp: "sport",
      deleted: false,
      changedAt: "2026-10-12T08:00:00.000Z",
    });
    fake.put("placements", {
      id: "p2",
      calendar: ANNAS,
      date: "2026-10-12",
      stamp: "annas",
      deleted: false,
    });
    fake.put("notes", {
      id: "n1",
      calendar: HOME,
      date: "2026-10-13",
      content: { v: 1, lines: [[{ text: "Nur eine Notiz" }]] },
      deleted: false,
      changedAt: "2026-10-13T08:00:00.000Z",
    });
    const text = await textOf(fake.payload, { id: HOME, name: "Familie" }, DE);
    expect(text).toContain("SUMMARY:Sport\r\n");
    expect(text).toContain("SUMMARY:Nur eine Notiz\r\n");
    expect(text).toContain("DESCRIPTION:Nur eine Notiz\r\n");
    expect(text).not.toContain("Wolke");
    expect(text).not.toContain("secret");
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});
