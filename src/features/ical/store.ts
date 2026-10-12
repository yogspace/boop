import type { Payload, Where } from "payload";
// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { isLocale, type Locale } from "../../i18n/config";
import {
  calendarText,
  type FeedWords,
  isToken,
  memberOf,
  newToken,
  refOf,
} from "./rules";

/**
 * The feeds in the database – always with full access, for the server's own
 * use: nothing else reaches the collection (collection.ts). Whom to show
 * what is the callers' to decide (endpoints.ts).
 *
 * A token is only ever compared here, never logged.
 */

type Doc = Record<string, unknown>;

const FEEDS = "calendar-feeds";

export type Feed = {
  id: string;
  account: string;
  calendar: string;
  token: string;
  createdAt: string | null;
  lastFetchedAt: string | null;
};

const when = (value: unknown): string | null => {
  if (!value) return null;
  const time = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
};

const rowOf = (doc: Doc): Feed => ({
  id: String(doc.id),
  account: refOf(doc.account),
  calendar: refOf(doc.calendar),
  token: String(doc.token ?? ""),
  createdAt: when(doc.createdAt),
  lastFetchedAt: when(doc.lastFetchedAt),
});

const mine = (account: string, calendar: string): Where => ({
  and: [{ account: { equals: account } }, { calendar: { equals: calendar } }],
});

/** The address an account made for a calendar – none: null. */
export const feedOf = async (
  payload: Payload,
  account: string,
  calendar: string
): Promise<Feed | null> => {
  const { docs } = await payload.find({
    collection: FEEDS,
    where: mine(account, calendar),
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return docs[0] ? rowOf(docs[0] as unknown as Doc) : null;
};

/** Takes an account's address for a calendar back – dead at once. */
export const dropFeed = async (
  payload: Payload,
  account: string,
  calendar: string
) => {
  await payload.delete({
    collection: FEEDS,
    where: mine(account, calendar),
    overrideAccess: true,
  });
};

/**
 * An address for an account's calendar that has none. One per account and
 * calendar (collection.ts): with one there already, this fails.
 */
export const makeFeed = async (
  payload: Payload,
  account: string,
  calendar: string
): Promise<Feed> => {
  const doc = await payload.create({
    collection: FEEDS,
    data: { account, calendar, token: newToken() },
    depth: 0,
    overrideAccess: true,
  });
  return rowOf(doc as unknown as Doc);
};

/**
 * A new address in place of the one there was: the old one is dead at
 * once, and whatever fetched it gets a 404.
 */
export const renewFeed = async (
  payload: Payload,
  account: string,
  calendar: string
): Promise<Feed> => {
  await dropFeed(payload, account, calendar);
  return makeFeed(payload, account, calendar);
};

/** A calendar as a feed needs it: its name, and who is in it. */
export const calendarOf = async (
  payload: Payload,
  id: string
): Promise<Doc | null> => {
  if (!id) return null;
  const doc = await payload.findByID({
    collection: "calendars",
    id,
    select: { name: true, members: true, deleted: true },
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  });
  return (doc as unknown as Doc | null) ?? null;
};

/** A feed that is good: whose, of which calendar, in which language. */
export type OpenFeed = {
  feed: Feed;
  calendar: { id: string; name: string };
  /** The account's – the feed's own few words are in it. */
  locale: Locale;
};

/**
 * The feed behind an address's token – only while it is good: its account
 * still there, and still in the calendar. Asked at every fetch. Otherwise
 * null, the same for every reason: no such token, taken back, left, taken
 * out, the calendar deleted. A feed found dead is removed on the way.
 */
export const openFeed = async (
  payload: Payload,
  token: unknown
): Promise<OpenFeed | null> => {
  if (!isToken(token)) return null;
  const { docs } = await payload.find({
    collection: FEEDS,
    where: { token: { equals: token } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (!docs[0]) return null;
  const feed = rowOf(docs[0] as unknown as Doc);
  const [calendar, account] = await Promise.all([
    calendarOf(payload, feed.calendar),
    payload.findByID({
      collection: "accounts",
      id: feed.account,
      select: { locale: true },
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
    }),
  ]);
  if (!(account && memberOf(calendar, feed.account))) {
    // Cleaning up must not change the answer – a next fetch tries again.
    await payload
      .delete({ collection: FEEDS, id: feed.id, overrideAccess: true })
      .catch(() => undefined);
    return null;
  }
  const { locale } = account as unknown as Doc;
  return {
    feed,
    calendar: { id: feed.calendar, name: String(calendar?.name ?? "") },
    locale: isLocale(locale) ? locale : "de",
  };
};

/**
 * The calendar's text as it is right now – for a feed's fetch, or the file.
 * Made of its prints, its notes and the prints' stamps (their names; the
 * drawings stay where they are). Markers come along: they say when a day
 * last changed (rules.ts).
 */
export const textOf = async (
  payload: Payload,
  calendar: { id: string; name: string },
  words: FeedWords
) => {
  const where = { calendar: { equals: calendar.id } };
  const [placements, notes] = await Promise.all([
    payload.find({
      collection: "placements",
      where,
      select: {
        calendar: true,
        date: true,
        stamp: true,
        deleted: true,
        changedAt: true,
        createdAt: true,
      },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
    payload.find({
      collection: "notes",
      where,
      select: {
        calendar: true,
        date: true,
        content: true,
        deleted: true,
        changedAt: true,
      },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
  ]);
  const prints = placements.docs as unknown as Doc[];
  const ids = [
    ...new Set(
      prints
        .filter((print) => !print.deleted)
        .map((print) => refOf(print.stamp))
        .filter(Boolean)
    ),
  ];
  const stamps = ids.length
    ? await payload.find({
        collection: "stamps",
        where: { id: { in: ids } },
        select: { name: true, deleted: true, changedAt: true },
        depth: 0,
        pagination: false,
        overrideAccess: true,
      })
    : { docs: [] };
  return calendarText({
    calendar,
    placements: prints,
    notes: notes.docs as unknown as Doc[],
    stamps: stamps.docs as unknown as Doc[],
    words,
  });
};

/** A calendar app asked: noted – once a day at most. */
export const noteFetched = async (
  payload: Payload,
  feed: Feed,
  now = new Date()
) => {
  const at = now.toISOString();
  // The same day (UTC) as the last one noted – nothing to write.
  if (feed.lastFetchedAt?.slice(0, 10) === at.slice(0, 10)) return;
  await payload.update({
    collection: FEEDS,
    id: feed.id,
    data: { lastFetchedAt: at },
    depth: 0,
    overrideAccess: true,
  });
};

/**
 * Removes every feed whose account is no longer in its calendar – it left,
 * was taken out, or the calendar is gone. Such an address is dead anyway
 * (`openFeed`); this takes away what is left of the ones nobody fetches any
 * more – daily, with the cleanup (accounts/cleanup.ts). Returns how many
 * went; with `dry`, how many would – nothing is deleted.
 */
export const sweepFeeds = async (
  payload: Payload,
  { dry = false }: { dry?: boolean } = {}
) => {
  const { docs } = await payload.find({
    collection: FEEDS,
    select: { account: true, calendar: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const feeds = (docs as unknown as Doc[]).map(rowOf);
  if (!feeds.length) return 0;
  const calendars = await payload.find({
    collection: "calendars",
    where: { id: { in: [...new Set(feeds.map((feed) => feed.calendar))] } },
    select: { members: true, deleted: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const known = new Map(
    (calendars.docs as unknown as Doc[]).map((doc) => [String(doc.id), doc])
  );
  const dead = feeds
    .filter((feed) => !memberOf(known.get(feed.calendar), feed.account))
    .map((feed) => feed.id);
  if (dead.length && !dry) {
    await payload.delete({
      collection: FEEDS,
      where: { id: { in: dead } },
      overrideAccess: true,
    });
  }
  return dead.length;
};
