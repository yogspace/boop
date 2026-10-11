"use client";

import { actionLabel, groupActions } from "../actions";
import { pathLabel } from "../page-names";
import { tally } from "../tally";
import {
  type BarEntry,
  BarList,
  barTable,
  ChartCard,
  deviceSlices,
  Key,
  Ring,
} from "./charts";
import { inWindow, rangeWindow, useAnalytics } from "./data";
import { fmt, Loading, MUTED, Note, TEXT } from "./parts";

/**
 * What people did: accounts, calendars, stamps, export – in the range from
 * the sidebar (or the hour or day chosen in the chart), each against the
 * same span before. Where it happened, and on which devices.
 */
export const AnalyticsActions = () => {
  const { data, range, focus } = useAnalytics();
  if (!data) return <Loading />;

  const w = rangeWindow(range, data.lastDigestAt);
  const inRange = focus
    ? inWindow(focus.from, focus.to)
    : inWindow(w.from, w.open ? Number.POSITIVE_INFINITY : w.to);
  const actions = data.actions.filter(inRange);
  const previous =
    !focus && w.previous
      ? new Map(
          tally(
            data.actions
              .filter(inWindow(w.previous.from, w.previous.to))
              .map((row) => row.name)
          )
        )
      : null;
  const counts = new Map(tally(actions.map((row) => row.name)));

  // In each group's fixed order, only what happened (now or before) – names
  // no longer in the list (older rows) under “Other”.
  const happened = new Set([...counts.keys(), ...(previous?.keys() ?? [])]);
  const groups = groupActions([...happened]).map((group) => ({
    title: group.title,
    entries: group.names.map(
      (name): BarEntry => ({
        name: actionLabel(name),
        value: counts.get(name) ?? 0,
        ...(previous && { before: previous.get(name) ?? 0 }),
      })
    ),
  }));
  const all = groups.flatMap((group) => group.entries);
  // One scale for every group: bars in different groups compare too.
  const max = Math.max(
    1,
    ...all.map((entry) => Math.max(entry.value, entry.before ?? 0))
  );

  const pages = tally(actions.map((row) => pathLabel(row.path ?? "—"))).map(
    ([name, value]) => ({ name, value })
  );
  const devices = deviceSlices(actions.map((row) => row.device));

  return (
    <div className="boop-viz">
      <Note>
        {focus ? focus.label : w.label} · {fmt(actions.length)} actions
        {previous && w.previous && (
          <span style={{ color: MUTED }}>
            {" "}
            – “before” is {w.previous.label}
          </span>
        )}
      </Note>
      {all.length === 0 ? (
        <Note>Nothing done in this time range.</Note>
      ) : (
        <>
          <ChartCard
            aside={
              previous && (
                <Key color="var(--viz-before)" line>
                  before
                </Key>
              )
            }
            table={barTable(all, "Action")}
            title="What people did"
          >
            <div
              style={{
                display: "grid",
                gap: "18px 32px",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              }}
            >
              {groups.map((group) => (
                <div key={group.title}>
                  <h5
                    style={{
                      color: TEXT,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      margin: "0 0 10px",
                      textTransform: "uppercase",
                    }}
                  >
                    {group.title}
                  </h5>
                  <BarList
                    entries={group.entries}
                    legend={false}
                    limit={20}
                    max={max}
                  />
                </div>
              ))}
            </div>
          </ChartCard>
          {actions.length > 0 && (
            <div className="boop-viz__grid">
              <ChartCard table={barTable(pages, "Page")} title="On which page">
                <BarList entries={pages} />
              </ChartCard>
              <ChartCard
                table={{
                  head: ["Device", "Actions"],
                  rows: devices.map((slice) => [slice.name, slice.value]),
                }}
                title="On which device"
              >
                <Ring slices={devices} unit="actions" />
              </ChartCard>
            </div>
          )}
        </>
      )}
    </div>
  );
};
