"use client";

import { Button } from "@payloadcms/ui";
import { pathLabel } from "../page-names";
import { tally } from "../tally";
import {
  AreaChart,
  ChartCard,
  Key,
  Meter,
  Sparkline,
  type TimePoint,
  timeTable,
} from "./charts";
import {
  countInSlots,
  deleteRows,
  inWindow,
  rangeWindow,
  setFocus,
  timeSlots,
  useAnalytics,
} from "./data";
import {
  ButtonRow,
  compare,
  fmt,
  Loading,
  MUTED,
  Note,
  ResetChip,
  StatGrid,
  StatTile,
} from "./parts";

/** The two actions that stand beside the page views at the top. */
const isStamp = (row: { name: string }) => row.name === "stamp-placed";
const isDay = (row: { name: string }) => row.name === "day-opened";

/**
 * The range from the sidebar at a glance: key figures with their course,
 * the page views over time against the period before, deleting. ONE range
 * for the whole global – figures, chart, Visitors and Actions count the
 * same rows, so the numbers agree with each other.
 */
export const AnalyticsOverview = () => {
  const { data, busy, failed, range, focus } = useAnalytics();
  if (failed && !data) return <Note>Could not load the analytics.</Note>;
  if (!data) return <Loading />;

  const w = rangeWindow(range, data.lastDigestAt);
  // An open range runs until now – without an upper bound, so a view from
  // just now belongs to it.
  const until = w.open ? Number.POSITIVE_INFINITY : w.to;
  const views = data.views.filter(inWindow(w.from, until));
  const actions = data.actions.filter(inWindow(w.from, until));
  const before = w.previous;
  const earlier = <T extends { createdAt: string }>(rows: T[]) =>
    before ? rows.filter(inWindow(before.from, before.to)) : null;
  const viewsBefore = earlier(data.views);
  const actionsBefore = earlier(data.actions);

  const stamps = actions.filter(isStamp);
  const days = actions.filter(isDay);
  const [topPage] = tally(views.map((row) => row.path));
  // Without internal navigation – it says nothing about where people came
  // from.
  const external = views.filter((row) => row.referrer !== "internal");
  const [topSource] = tally(external.map((row) => row.referrer));

  // Every hour or day of the range – and the same moment of the period
  // before, for the gray line.
  const slots = timeSlots(w);
  const counts = countInSlots(slots, views);
  const shift = before ? w.from - before.from : 0;
  const beforeCounts = before
    ? countInSlots(
        slots.map((slot) => ({ from: slot.from - shift, to: slot.to - shift })),
        data.views
      )
    : null;
  const points: TimePoint[] = slots.map((slot, i) => ({
    ...slot,
    count: counts[i],
    ...(beforeCounts && { before: beforeCounts[i] }),
  }));

  const versus = (now: number, then: number | undefined) =>
    then === undefined || !before ? {} : compare(now, then, before.label);

  const confirmRange = () => {
    if (
      window.confirm(
        `Delete the ${fmt(views.length)} page views and ${fmt(actions.length)} actions of "${w.label}"? This cannot be undone.`
      )
    ) {
      deleteRows(w);
    }
  };
  const confirmAll = () => {
    if (
      window.confirm(
        `Delete ALL ${fmt(data.views.length)} page views and ${fmt(data.actions.length)} actions? This cannot be undone.`
      )
    ) {
      deleteRows("all");
    }
  };

  return (
    <div className="boop-viz">
      <Note>
        {w.label}
        {before && (
          <span style={{ color: MUTED }}> · compared with {before.label}</span>
        )}
      </Note>
      <StatGrid>
        <StatTile
          label="Page views"
          value={views.length}
          {...versus(views.length, viewsBefore?.length)}
        >
          <Sparkline values={counts} />
        </StatTile>
        <StatTile
          label="Stamps placed"
          value={stamps.length}
          {...versus(stamps.length, actionsBefore?.filter(isStamp).length)}
        >
          <Sparkline values={countInSlots(slots, stamps)} />
        </StatTile>
        <StatTile
          label="Days opened"
          value={days.length}
          {...versus(days.length, actionsBefore?.filter(isDay).length)}
        >
          <Sparkline values={countInSlots(slots, days)} />
        </StatTile>
        <StatTile
          detail={
            topPage
              ? `${pathLabel(topPage[0])} · ${Math.round((topPage[1] / views.length) * 100)} % of views`
              : "—"
          }
          detailTitle={topPage?.[0]}
          label="Most viewed page"
          value={topPage ? topPage[1] : 0}
        >
          <Meter part={topPage?.[1] ?? 0} whole={views.length} />
        </StatTile>
        <StatTile
          detail={
            topSource
              ? `${topSource[0]} · ${Math.round((topSource[1] / external.length) * 100)} % of arrivals`
              : "—"
          }
          label="Top source"
          value={topSource ? topSource[1] : 0}
        >
          <Meter part={topSource?.[1] ?? 0} whole={external.length} />
        </StatTile>
      </StatGrid>

      <div style={{ height: 12 }} />
      <ChartCard
        aside={
          <>
            <Key color="var(--viz-1)" line>
              {w.label}
            </Key>
            {before && (
              <Key color="var(--viz-before)" line>
                {before.label}
              </Key>
            )}
          </>
        }
        table={timeTable(points, "Page views")}
        title={
          w.grain === "hour" ? "Page views per hour" : "Page views per day"
        }
      >
        {views.length === 0 && !viewsBefore?.length ? (
          <Note>No views in this range.</Note>
        ) : (
          <AreaChart
            // A click chooses the hour or day – once more lifts it.
            onSelect={(point) =>
              focus?.from === point.from
                ? setFocus(null)
                : setFocus({
                    from: point.from,
                    to: point.to,
                    label: point.title,
                  })
            }
            points={points}
            selectedFrom={focus?.from ?? null}
            unit="views"
          />
        )}
        <div
          style={{
            alignItems: "center",
            color: MUTED,
            display: "flex",
            flexWrap: "wrap",
            fontSize: 12,
            gap: 8,
            marginTop: 6,
          }}
        >
          {focus ? (
            <>
              Visitors & Actions show only {focus.label}
              <ResetChip
                onReset={() => setFocus(null)}
                title="Show the whole range again"
              />
            </>
          ) : (
            "Click the chart to narrow Visitors and Actions down to that hour or day."
          )}
        </div>
      </ChartCard>

      <Note>Deleting removes stored page views and actions for good.</Note>
      <ButtonRow>
        {range !== "90d" && (
          <Button
            buttonStyle="subtle"
            disabled={busy || views.length + actions.length === 0}
            margin={false}
            onClick={confirmRange}
            size="medium"
            type="button"
          >
            {`Delete this range (${fmt(views.length + actions.length)})`}
          </Button>
        )}
        <Button
          buttonStyle="subtle"
          disabled={busy || data.views.length + data.actions.length === 0}
          margin={false}
          onClick={confirmAll}
          size="medium"
          type="button"
        >
          Delete everything
        </Button>
      </ButtonRow>
    </div>
  );
};
