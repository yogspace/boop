"use client";

import { useEffect, useState } from "react";
import type { AccountTotals } from "../account-totals";
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

/**
 * Counted on the server: calendars, stamps and prints are closed over REST,
 * to admins too (src/access). It hands over only what the numbers need –
 * never an email, a name, a stamp's drawing or a calendar's content; of the
 * stamps and prints only when (and on which calendar day) they were made,
 * within the 90 days the ranges reach.
 */
const load = async (): Promise<AccountTotals> => {
  const since = encodeURIComponent(
    new Date(Date.now() - DAYS * DAY_MS).toISOString()
  );
  const url = `/api/globals/analytics/accounts?since=${since}`;
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return (await response.json()) as AccountTotals;
};

/**
 * The accounts as totals – none of them listed, nothing that tells one from
 * another: new ones in the range from the sidebar, how many are verified,
 * how many calendars are shared, how much is drawn. What people do with them
 * (logging in, placing stamps …) is under Actions, anonymous like every
 * action.
 */
export const AnalyticsAccounts = () => {
  const { data, range } = useAnalytics();
  const [totals, setTotals] = useState<AccountTotals | null>(null);
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
  const { shared } = calendars;
  const stampsNew = stamps.filter(inWindow(w.from, until));
  // The calendar days that got a stamp in the range – each counted once,
  // however many stamps went onto it.
  const daysStamped = new Set(
    placements.filter(inWindow(w.from, until)).map((row) => row.day)
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
          detail={`of ${fmt(calendars.total)} calendars (${percent(shared, calendars.total)}) have more than one member`}
          label="Shared calendars"
          value={shared}
        >
          <Meter part={shared} whole={calendars.total} />
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
