"use client";

import { useEffect, useState } from "react";
import { Meter, Sparkline } from "./charts";
import {
  countInSlots,
  DAY_MS,
  DAYS,
  inWindow,
  rangeWindow,
  timeSlots,
  useAnalytics,
} from "./data";
import {
  compare,
  fmt,
  Loading,
  MUTED,
  Note,
  percent,
  StatGrid,
  StatTile,
} from "./parts";

type Dated = { createdAt: string };
type AccountRow = Dated & { _verified?: boolean | null };
type CalendarRow = { owner?: unknown; members?: unknown[] | null };
/** A stamp put on a day – a day has no document of its own. */
type PlacementRow = Dated & { calendar?: unknown; date?: string | null };

type Totals = {
  accounts: AccountRow[];
  calendars: CalendarRow[];
  /** Stamps and placements of the 90 days kept – for the range. */
  stamps: Dated[];
  placements: PlacementRow[];
  /** All stamps ever (not deleted). */
  stampsTotal: number;
};

/**
 * Calendars, stamps and placements are synced from the devices and keep a
 * `deleted` marker instead of vanishing – those are gone and not counted.
 */
const LIVE = "where[deleted][not_equals]=true";

const get = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return (await response.json()) as T;
};

const list = async <T,>(collection: string, query: string) =>
  (
    await get<{ docs?: T[] }>(
      `/api/${collection}?depth=0&limit=0&pagination=false&${query}`
    )
  ).docs ?? [];

/**
 * Only the fields the numbers need – never an email, a name, a stamp's
 * drawing or a calendar's content. Of the stamps and placements only when
 * (and on which calendar day) they were made, and only within the 90 days
 * the ranges reach.
 */
const load = async (): Promise<Totals> => {
  const since = encodeURIComponent(
    new Date(Date.now() - DAYS * DAY_MS).toISOString()
  );
  const recent = `${LIVE}&where[createdAt][greater_than_equal]=${since}&select[createdAt]=true`;
  const [accounts, calendars, stamps, placements, stampsCount] =
    await Promise.all([
      list<AccountRow>(
        "accounts",
        "select[createdAt]=true&select[_verified]=true"
      ),
      list<CalendarRow>(
        "calendars",
        `${LIVE}&select[owner]=true&select[members]=true`
      ),
      list<Dated>("stamps", recent),
      list<PlacementRow>(
        "placements",
        `${recent}&select[calendar]=true&select[date]=true`
      ),
      get<{ totalDocs?: number }>(`/api/stamps/count?${LIVE}`),
    ]);
  return {
    accounts,
    calendars,
    stamps,
    placements,
    stampsTotal: Number(stampsCount.totalDocs) || 0,
  };
};

/** A relationship's id – at depth 0 the id itself, else the document's. */
const idOf = (value: unknown): string | null => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (value && typeof value === "object" && "id" in value) {
    return String((value as { id: unknown }).id);
  }
  return null;
};

/**
 * Shared = more than one person in it. The owner is always among the
 * members; joined with them here anyway, counted once, so it holds either
 * way.
 */
const isShared = (calendar: CalendarRow) =>
  new Set(
    [calendar.owner, ...(calendar.members ?? [])].flatMap(
      (value) => idOf(value) ?? []
    )
  ).size > 1;

/**
 * The accounts as totals – none of them listed, nothing that tells one from
 * another: new ones in the range from the sidebar, how many are verified,
 * how many calendars are shared, how much is drawn. What people do with them
 * (logging in, placing stamps …) is under Actions, anonymous like every
 * action.
 */
export const AnalyticsAccounts = () => {
  const { data, range } = useAnalytics();
  const [totals, setTotals] = useState<Totals | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    load().then(setTotals, () => setFailed(true));
  }, []);

  if (failed) return <Note>The accounts could not be loaded.</Note>;
  if (!(data && totals)) return <Loading />;

  const w = rangeWindow(range, data.lastDigestAt);
  const until = w.open ? Number.POSITIVE_INFINITY : w.to;
  const { accounts, calendars, stamps, placements, stampsTotal } = totals;
  const created = accounts.filter(inWindow(w.from, until)).length;
  const before =
    w.previous &&
    accounts.filter(inWindow(w.previous.from, w.previous.to)).length;
  const verified = accounts.filter((row) => row._verified).length;
  const shared = calendars.filter(isShared).length;
  const stampsNew = stamps.filter(inWindow(w.from, until));
  // The calendar days that got a stamp in the range – each counted once,
  // however many stamps went onto it.
  const daysStamped = new Set(
    placements
      .filter(inWindow(w.from, until))
      .map((row) => `${idOf(row.calendar)}|${row.date}`)
  ).size;
  const slots = timeSlots(w);

  return (
    <div className="boop-viz">
      <Note>
        {w.label} – totals only, no account is listed.
        <span style={{ color: MUTED }}>
          {" "}
          Logins, stamps placed and the like are under Actions.
        </span>
      </Note>
      <StatGrid>
        <StatTile
          label="New accounts"
          value={created}
          {...(before !== null && w.previous
            ? compare(created, before, w.previous.label)
            : {})}
        >
          <Sparkline values={countInSlots(slots, accounts)} />
        </StatTile>
        <StatTile
          detail={`${percent(verified, accounts.length)} of all accounts`}
          label="Verified"
          value={verified}
        >
          <Meter part={verified} whole={accounts.length} />
        </StatTile>
        <StatTile
          detail={`${fmt(accounts.length - verified)} not verified yet`}
          label="All accounts"
          value={accounts.length}
        />
        <StatTile
          detail={`of ${fmt(calendars.length)} calendars (${percent(shared, calendars.length)}) have more than one member`}
          label="Shared calendars"
          value={shared}
        >
          <Meter part={shared} whole={calendars.length} />
        </StatTile>
        <StatTile
          detail={`${fmt(stampsNew.length)} new in this range · ${fmt(daysStamped)} calendar days stamped`}
          label="Stamps drawn"
          value={stampsTotal}
        >
          <Sparkline values={countInSlots(slots, stampsNew)} />
        </StatTile>
      </StatGrid>
    </div>
  );
};
