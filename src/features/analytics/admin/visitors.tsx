"use client";

import { tally } from "../tally";
import { deviceName, type Visit } from "../visit-matrix";
import { BarList, barTable, ChartCard, deviceSlices, Ring } from "./charts";
import {
  deviceRows,
  inWindow,
  rangeWindow,
  resetDevice,
  setFocus,
  useAnalytics,
} from "./data";
import { fmt, Loading, MUTED, Note, ResetChip } from "./parts";
import { VisitMatrix } from "./visit-matrix";

/**
 * Who opened what – on which devices, and where they came from. In the
 * range from the sidebar, the same as in Overview, so the numbers here add
 * up to those there. The hour or day chosen in the chart narrows down
 * (`focus`).
 */
export const AnalyticsVisitors = () => {
  const { data, busy, range, focus } = useAnalytics();
  if (!data) return <Loading />;

  const w = rangeWindow(range, data.lastDigestAt);
  const inRange = focus
    ? inWindow(focus.from, focus.to)
    : inWindow(w.from, w.open ? Number.POSITIVE_INFINITY : w.to);
  const views = data.views.filter(inRange);

  // Every view as a pair of page and device profile – the matrix builds both
  // directions from it. The profile is class, system and browser in ONE name:
  // counted apart, “62 % mobile” and “58 % Safari” could not be told to be
  // the same views or not.
  const visits: Visit[] = views.map((row) => ({
    page: row.path || "—",
    device: deviceName(row),
    at: new Date(row.createdAt).getTime(),
  }));

  // Sources without internal navigation – it says nothing about where people
  // came from and would dwarf everything else.
  const sources = tally(
    views.filter((r) => r.referrer !== "internal").map((r) => r.referrer)
  ).map(([name, value]) => ({ name, value }));
  const devices = deviceSlices(views.map((row) => row.device));

  // Deletes all views of a device profile – one's own devices from before
  // “Own devices”. Over ALL 90 days, not just the range: a half-deleted
  // device would be worse than none.
  const onResetDevice = (device: string) => {
    const total = deviceRows(device).length;
    if (!total) return;
    if (
      window.confirm(
        `Delete all ${fmt(total)} page views of "${device}" (last 90 days)? This cannot be undone.`
      )
    ) {
      resetDevice(device);
    }
  };

  return (
    <div className="boop-viz">
      {focus ? (
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <span style={{ color: "var(--theme-elevation-800)", fontSize: 13 }}>
            Only <strong>{focus.label}</strong> (from the chart) ·{" "}
            {fmt(views.length)} page views
          </span>
          <ResetChip
            onReset={() => setFocus(null)}
            title={`Back to the whole range (${w.label})`}
          />
        </div>
      ) : (
        <Note>
          {w.label} · {fmt(views.length)} page views
          <span style={{ color: MUTED }}>
            {" "}
            – click the chart in Overview to narrow down
          </span>
        </Note>
      )}

      {visits.length === 0 ? (
        <Note>No visits in this time range.</Note>
      ) : (
        <>
          <div className="boop-viz__grid">
            <ChartCard
              table={{
                head: ["Device", "Page views"],
                rows: devices.map((slice) => [slice.name, slice.value]),
              }}
              title="Devices"
            >
              <Ring slices={devices} unit="page views" />
            </ChartCard>
            <ChartCard
              aside="without internal navigation"
              table={barTable(sources, "Source")}
              title="Sources"
            >
              <BarList entries={sources} />
            </ChartCard>
          </div>
          <ChartCard title="Pages × devices">
            <VisitMatrix
              busy={busy}
              onResetDevice={onResetDevice}
              visits={visits}
            />
          </ChartCard>
        </>
      )}
    </div>
  );
};
