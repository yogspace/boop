import type { Endpoint, PayloadRequest } from "payload";
import { localeOf } from "@/features/accounts/emails";
import { sessionAccount } from "@/features/accounts/session";
import { getDictionary } from "@/features/translations/get-texts";
import type { Locale } from "@/i18n/config";
import { rateLimit } from "@/lib/rate-limit";
import { serverUrl } from "@/lib/server-url";
import {
  dispositionOf,
  etagOf,
  type FeedWords,
  feedPath,
  memberOf,
  sameEtag,
} from "./rules";
import {
  calendarOf,
  dropFeed,
  type Feed,
  feedOf,
  makeFeed,
  noteFetched,
  openFeed,
  renewFeed,
  sweepFeeds,
  textOf,
} from "./store";

/**
 * A calendar in a calendar app. The feed, for whoever has its address – no
 * cookie, the token in it is the key (calendar apps can't log in):
 *
 *   GET    /api/ical/{token}.ics            the calendar as iCalendar text
 *
 * And for the own account – found by the app's cookie (`sessionAccount`,
 * which refuses requests from other sites) – about a calendar it is in:
 *
 *   GET    /api/ical/feeds/:calendar        its address, if it made one
 *   POST   /api/ical/feeds/:calendar        makes one – or the one there is
 *   POST   /api/ical/feeds/:calendar/renew  a new one; the old is dead at once
 *   DELETE /api/ical/feeds/:calendar        takes it back
 *   POST   /api/ical/export/:calendar       the same text once, as a file
 *
 * A feed is good only while its account is in the calendar – asked at every
 * fetch (store.ts, `openFeed`). An address that isn't, for whatever reason,
 * is a plain 404.
 */

// A calendar app asks every hour or so (ics.ts, `REFRESH`), a few devices
// may share one address – far below this. Counted per feed, once its token
// is known to be one: a guess is never kept.
const tooManyFetches = rateLimit({ limit: 60, windowMs: 60 * 60 * 1000 });
// Opening the settings, making and taking back – and reading a whole
// calendar out again and again. Both per account.
const tooManyCalls = rateLimit({ limit: 120, windowMs: 60 * 60 * 1000 });
const tooManyExports = rateLimit({ limit: 20, windowMs: 60 * 60 * 1000 });

const CALENDAR = "text/calendar; charset=utf-8";

/** The feed's own few words, in a language – the CMS's (features/translations). */
const wordsOf = async (locale: Locale): Promise<FeedWords> =>
  (await getDictionary(locale)).app.ical;

/** What the app hears about an account's address for a calendar. */
export type FeedState = {
  /** The address to subscribe to – null: none made, or taken back. */
  url: string | null;
  /** Since when it is good. */
  createdAt: string | null;
  /** When a calendar app last fetched it – noted once a day at most. */
  lastFetchedAt: string | null;
};

const answer = (feed: Feed | null) =>
  Response.json(
    {
      url: feed ? `${serverUrl()}${feedPath(feed.token)}` : null,
      createdAt: feed?.createdAt ?? null,
      lastFetchedAt: feed?.lastFetchedAt ?? null,
    } satisfies FeedState,
    { headers: { "Cache-Control": "no-store" } }
  );

/** No such feed – said the same whatever the reason, and never why. */
const notFound = () =>
  new Response("Not found.", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });

/**
 * The feed. Nothing of the request is ever logged – its address is the
 * key: an error is noted by its kind alone, and answered without a word.
 */
const serveFeed = async (req: PayloadRequest): Promise<Response> => {
  const { payload } = req;
  try {
    const open = await openFeed(payload, req.routeParams?.token);
    if (!open) return notFound();
    if (tooManyFetches(open.feed.id)) {
      return new Response("Too many requests.", {
        status: 429,
        headers: { "Retry-After": "900", "Cache-Control": "no-store" },
      });
    }
    const words = await wordsOf(open.locale);
    const text = await textOf(payload, open.calendar, words);
    await noteFetched(payload, open.feed).catch(() => undefined);
    const etag = etagOf(text);
    // Private: the answer is this address's alone – no shared cache keeps
    // it. And asked for anew every time, so a 304 is all an app gets while
    // nothing changed.
    const cache = { ETag: etag, "Cache-Control": "private, no-cache" };
    if (sameEtag(req.headers.get("if-none-match"), etag)) {
      return new Response(null, { status: 304, headers: cache });
    }
    return new Response(req.method === "HEAD" ? null : text, {
      headers: {
        ...cache,
        "Content-Type": CALENDAR,
        // Saved from a browser it is named by the calendar, not the token.
        "Content-Disposition": dispositionOf("inline", open.calendar.name, {
          locale: open.locale,
          words,
        }),
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    payload.logger.error(
      `[ical] A feed could not be read (${error instanceof Error ? error.name : "error"}).`
    );
    return new Response(null, { status: 500 });
  }
};

/** The account and its calendar – or the answer that refuses. */
const guard = async (req: PayloadRequest, tooMany = tooManyCalls) => {
  const me = await sessionAccount(req);
  if (!me) return Response.json({ error: "Not logged in." }, { status: 401 });
  const account = String(me.id);
  if (tooMany(account)) {
    return Response.json({ error: "Too many tries." }, { status: 429 });
  }
  // Members only – the owner is one of them.
  const id = String(req.routeParams?.calendar ?? "");
  const calendar = await calendarOf(req.payload, id);
  if (!memberOf(calendar, account)) {
    return Response.json({ error: "Not your calendar." }, { status: 403 });
  }
  return {
    account,
    locale: localeOf(me),
    calendar: { id, name: String(calendar?.name ?? "") },
  };
};

/**
 * After a new address the feeds are swept: those whose account is no
 * longer in their calendar go (anyone's).
 */
const swept = async (req: PayloadRequest, feed: Feed) => {
  await sweepFeeds(req.payload).catch(() => undefined);
  return answer(feed);
};

export const icalEndpoints: Endpoint[] = [
  // HEAD too: some apps ask for the headers alone before they subscribe.
  ...(["get", "head"] as const).map(
    (method): Endpoint => ({
      path: "/ical/:token.ics",
      method,
      handler: serveFeed,
    })
  ),
  {
    path: "/ical/feeds/:calendar",
    method: "get",
    handler: async (req) => {
      const mine = await guard(req);
      if (mine instanceof Response) return mine;
      return answer(await feedOf(req.payload, mine.account, mine.calendar.id));
    },
  },
  {
    // Asked twice, it is still the one address – also asked twice at once:
    // the second one made then stands back (one per account and calendar,
    // collection.ts), and the first one's is the answer.
    path: "/ical/feeds/:calendar",
    method: "post",
    handler: async (req) => {
      const mine = await guard(req);
      if (mine instanceof Response) return mine;
      const { account, calendar } = mine;
      const known = await feedOf(req.payload, account, calendar.id);
      if (known) return answer(known);
      let feed: Feed;
      try {
        feed = await makeFeed(req.payload, account, calendar.id);
      } catch (error) {
        const made = await feedOf(req.payload, account, calendar.id);
        if (!made) throw error;
        return answer(made);
      }
      return swept(req, feed);
    },
  },
  {
    // The old one got around, or is in an app it shouldn't be in.
    path: "/ical/feeds/:calendar/renew",
    method: "post",
    handler: async (req) => {
      const mine = await guard(req);
      if (mine instanceof Response) return mine;
      return swept(
        req,
        await renewFeed(req.payload, mine.account, mine.calendar.id)
      );
    },
  },
  {
    path: "/ical/feeds/:calendar",
    method: "delete",
    handler: async (req) => {
      const mine = await guard(req);
      if (mine instanceof Response) return mine;
      await dropFeed(req.payload, mine.account, mine.calendar.id);
      return answer(null);
    },
  },
  {
    // The calendar as a file – what the feed says, once. A POST: no link
    // from elsewhere can start it.
    path: "/ical/export/:calendar",
    method: "post",
    handler: async (req) => {
      const mine = await guard(req, tooManyExports);
      if (mine instanceof Response) return mine;
      const { calendar, locale } = mine;
      const words = await wordsOf(locale);
      return new Response(await textOf(req.payload, calendar, words), {
        headers: {
          "Content-Type": CALENDAR,
          "Content-Disposition": dispositionOf("attachment", calendar.name, {
            locale,
            words,
          }),
          "Cache-Control": "no-store",
        },
      });
    },
  },
];
