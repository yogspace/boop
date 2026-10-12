import type { Endpoint, PayloadRequest, Where } from "payload";
import { isAdmin } from "@/access";
import { idOf } from "@/features/calendar/membership";

/**
 * The numbers of the statistics' “Accounts” section (admin/accounts.tsx),
 * gathered on the server: what people made is closed over REST, to admins
 * too (src/access). Only what the numbers need leaves here, nothing that
 * tells a person or a calendar: when accounts were made and whether
 * confirmed; how many calendars there are and how many are shared; when
 * stamps were drawn; when prints were made and on which calendar day – the
 * calendar as a number that means something in this answer alone.
 *
 *   GET /api/globals/analytics/accounts?since=<ISO date>
 *
 * Stamps and prints from `since` on (the views' 90 days, by default those).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Synced documents keep a `deleted` marker – those don't count. */
const live: Where = { deleted: { not_equals: true } };

export type AccountTotals = {
  accounts: { createdAt: string; _verified: boolean }[];
  calendars: { total: number; shared: number };
  stamps: { createdAt: string }[];
  /** All stamps ever (not deleted). */
  stampsTotal: number;
  /** `day`: the calendar's number in this answer and the day, joined. */
  placements: { createdAt: string; day: string }[];
};

type Doc = Record<string, unknown>;

const sinceOf = (req: PayloadRequest) => {
  const asked = new Date(String(req.searchParams.get("since") ?? ""));
  return Number.isNaN(asked.getTime())
    ? new Date(Date.now() - 90 * DAY_MS)
    : asked;
};

/** More than one person in it – owner and members, each counted once. */
const isShared = (calendar: Doc) =>
  new Set(
    [calendar.owner, ...((calendar.members as unknown[] | null) ?? [])].flatMap(
      (value) => idOf(value) ?? []
    )
  ).size > 1;

export const accountTotals: Endpoint = {
  path: "/accounts",
  method: "get",
  handler: async (req) => {
    if (!isAdmin(req)) {
      return Response.json({ error: "Admins only." }, { status: 401 });
    }
    const { payload } = req;
    const recent: Where = {
      and: [
        live,
        { createdAt: { greater_than_equal: sinceOf(req).toISOString() } },
      ],
    };
    const all = { depth: 0, pagination: false, overrideAccess: true, req };

    const [accounts, calendars, stamps, placements, stampsTotal] =
      await Promise.all([
        payload.find({
          collection: "accounts",
          select: { createdAt: true, _verified: true },
          ...all,
        }),
        payload.find({
          collection: "calendars",
          where: live,
          select: { owner: true, members: true },
          ...all,
        }),
        payload.find({
          collection: "stamps",
          where: recent,
          select: { createdAt: true },
          ...all,
        }),
        payload.find({
          collection: "placements",
          where: recent,
          select: { createdAt: true, calendar: true, date: true },
          ...all,
        }),
        payload.count({ collection: "stamps", where: live, ...all }),
      ]);

    // Each calendar a number, in the order met – nothing to look it up by.
    const numbers = new Map<string, number>();
    const numberOf = (calendar: unknown) => {
      const id = idOf(calendar) ?? "";
      if (!numbers.has(id)) numbers.set(id, numbers.size);
      return numbers.get(id);
    };

    const body: AccountTotals = {
      accounts: (accounts.docs as unknown as Doc[]).map((row) => ({
        createdAt: String(row.createdAt),
        _verified: Boolean(row._verified),
      })),
      calendars: {
        total: calendars.docs.length,
        shared: (calendars.docs as unknown as Doc[]).filter(isShared).length,
      },
      stamps: (stamps.docs as unknown as Doc[]).map((row) => ({
        createdAt: String(row.createdAt),
      })),
      stampsTotal: stampsTotal.totalDocs,
      placements: (placements.docs as unknown as Doc[]).map((row) => ({
        createdAt: String(row.createdAt),
        day: `${numberOf(row.calendar)}|${String(row.date ?? "")}`,
      })),
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  },
};
