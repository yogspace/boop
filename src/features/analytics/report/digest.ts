import type { BasePayload, Where } from "payload";
import { serverUrl } from "@/lib/server-url";
import { ACTION_NAMES, actionLabel } from "../actions";
import { pathLabel } from "../page-names";
import { tally } from "../tally";
import { deviceName, type Visit } from "../visit-matrix";
import { reportBuckets, TZ } from "./buckets";
import {
  CHART_ID,
  PHONE_H,
  PHONE_W,
  ringPng,
  sparkPng,
  viewsChartPng,
} from "./chart-image";
import { compare, deviceParts, renderReportHtml } from "./email";

/**
 * The report for a period – subject, text, HTML and its pictures, without
 * sending it, so the mail can also be looked at locally.
 */

type ViewRow = {
  path?: string | null;
  referrer?: string | null;
  device?: string | null;
  os?: string | null;
  browser?: string | null;
  createdAt?: string | null;
};

type ActionRow = { name: string; createdAt?: string | null };

type Inline = { filename: string; contentId: string; content: Buffer };

/** The two figures beside the page views – actions counted on their own. */
const STAMPS = "stamp-placed";
const DAYS = "day-opened";

const textList = (
  entries: [string, number][],
  total: number,
  limit = 10
): string => {
  if (!entries.length) return "  (keine)";
  return entries
    .slice(0, limit)
    .map(([label, count]) => {
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      return `  ${count.toString().padStart(5)}  ${pct.toString().padStart(3)} %  ${label}`;
    })
    .join("\n");
};

const timesOf = (list: { createdAt?: string | null }[]) =>
  list.flatMap((row) =>
    row.createdAt ? [new Date(row.createdAt).getTime()] : []
  );

export const buildDigest = async (
  payload: BasePayload,
  {
    sinceMs,
    now,
    interval,
  }: { sinceMs: number; now: number; interval: { label: string } }
): Promise<{
  subject: string;
  text: string;
  html: string;
  total: number;
  /** The pictures in the mail (sendMail's `inline`). */
  inline: Inline[];
}> => {
  const since = new Date(sinceMs).toISOString();
  const period: Where = { createdAt: { greater_than_equal: since } };
  // The same span before – for the comparison (within the 90 days kept).
  const before: Where = {
    and: [
      {
        createdAt: {
          greater_than_equal: new Date(sinceMs - (now - sinceMs)).toISOString(),
        },
      },
      { createdAt: { less_than: since } },
    ],
  };

  const [views, actions, viewsBefore, actionsBefore] = await Promise.all([
    payload.find({
      collection: "page-views",
      where: period,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
    payload.find({
      collection: "actions",
      where: period,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
    // Only when they were – for the period before in the chart.
    payload.find({
      collection: "page-views",
      where: before,
      depth: 0,
      pagination: false,
      select: { createdAt: true },
      overrideAccess: true,
    }),
    payload.find({
      collection: "actions",
      where: before,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
  ]);
  const rows = views.docs as unknown as ViewRow[];
  const actionRows = actions.docs as unknown as ActionRow[];
  const actionRowsBefore = actionsBefore.docs as unknown as ActionRow[];
  const viewRowsBefore = viewsBefore.docs as unknown as ViewRow[];

  const total = rows.length;
  const byPage = tally(rows.map((r) => r.path)).map(
    ([path, count]): [string, number] => [pathLabel(path, "de"), count]
  );
  const sourceRows = rows.filter((r) => r.referrer !== "internal");
  const bySource = tally(sourceRows.map((r) => r.referrer));
  const byDevice = tally(rows.map(deviceName));

  const counts = new Map(tally(actionRows.map((row) => row.name)));
  const countsBefore = new Map(tally(actionRowsBefore.map((row) => row.name)));
  const actionList = ACTION_NAMES.filter(
    (name) => counts.has(name) || countsBefore.has(name)
  ).map((name) => ({
    name,
    label: actionLabel(name, "de"),
    count: counts.get(name) ?? 0,
    before: countsBefore.get(name) ?? 0,
  }));
  const stamps = counts.get(STAMPS) ?? 0;
  const days = counts.get(DAYS) ?? 0;

  // The same hours or days of the period before, laid over this one.
  const span = now - sinceMs;
  const beforeChart = reportBuckets(
    timesOf(viewRowsBefore).map((t) => t + span),
    sinceMs,
    now
  );
  const sparkOf = (list: { createdAt?: string | null }[]) =>
    reportBuckets(timesOf(list), sinceMs, now).buckets.map((b) => b.count);

  const visits: Visit[] = rows.map((row) => ({
    page: row.path || "—",
    device: deviceName(row),
    at: row.createdAt ? new Date(row.createdAt).getTime() : 0,
  }));

  const tz = { timeZone: TZ } as const;
  const periodLabel = `${new Date(sinceMs).toLocaleDateString("de-DE", tz)} – ${new Date(now).toLocaleDateString("de-DE", tz)}`;
  const chart = {
    ...reportBuckets(timesOf(rows), sinceMs, now),
    before: beforeChart.buckets.map((b) => b.count),
  };

  const adminUrl = `${serverUrl()}/admin/globals/analytics`;
  const title = `${interval.label}report`;
  const viewsDelta = compare(total, viewRowsBefore.length);
  const stampsDelta = compare(stamps, countsBefore.get(STAMPS) ?? 0);
  const daysDelta = compare(days, countsBefore.get(DAYS) ?? 0);
  const withDelta = (delta: { text: string } | null) =>
    delta ? ` (${delta.text})` : "";

  const text = [
    `Boop · ${title} — ${periodLabel}`,
    "",
    `Seitenaufrufe: ${total}${withDelta(viewsDelta)}`,
    `Stempel gesetzt: ${stamps}${withDelta(stampsDelta)}`,
    `Tage geöffnet: ${days}${withDelta(daysDelta)}`,
    "",
    "Seiten:",
    textList(byPage, total),
    "",
    "Geräte:",
    textList(byDevice, total),
    "",
    "Quellen (ohne interne Navigation):",
    textList(bySource, sourceRows.length),
    "",
    "Aktionen:",
    actionList.length
      ? actionList
          .map(
            (a) =>
              `  ${a.count.toString().padStart(5)}  ${a.label} (vorher ${a.before})`
          )
          .join("\n")
      : "  (keine)",
    "",
    `Analytics im Admin öffnen: ${adminUrl}`,
  ].join("\n");

  const [topPage] = byPage;
  const [topSource] = bySource;
  // The chart as a picture – without one (or if it fails) the mail draws
  // columns instead.
  const beforeShown = chart.before.some((n) => n > 0)
    ? chart.before
    : undefined;
  // Every picture on its own: one failing leaves the others.
  const picture = <T>(make: () => Promise<T>) =>
    make().catch((error) => {
      console.error("[stats-digest] picture failed:", error);
      return null;
    });
  const byClass = tally(rows.map((row) => row.device));
  const sparks = {
    views: chart.buckets.map((b) => b.count),
    stamps: sparkOf(actionRows.filter((row) => row.name === STAMPS)),
    days: sparkOf(actionRows.filter((row) => row.name === DAYS)),
  };
  const [png, phonePng, ring, viewsSpark, stampsSpark, daysSpark] =
    await Promise.all([
      picture(() => viewsChartPng(chart.buckets, beforeShown)),
      picture(() =>
        viewsChartPng(chart.buckets, beforeShown, {
          width: PHONE_W,
          height: PHONE_H,
        })
      ),
      picture(() => ringPng(deviceParts(byClass), total, "Aufrufe")),
      picture(() => sparkPng(sparks.views)),
      picture(() => sparkPng(sparks.stamps)),
      picture(() => sparkPng(sparks.days)),
    ]);
  // Each an embedded file of its own, referred to as `cid:<contentId>`.
  const files = [
    ["seitenaufrufe.png", CHART_ID, png],
    ["seitenaufrufe-handy.png", `${CHART_ID}-phone`, phonePng],
    ["geraete.png", "devices-ring", ring],
    ["verlauf-aufrufe.png", "spark-views", viewsSpark],
    ["verlauf-stempel.png", "spark-stamps", stampsSpark],
    ["verlauf-tage.png", "spark-days", daysSpark],
  ] as const;
  const inline = files.flatMap(([filename, contentId, content]) =>
    content ? [{ filename, contentId, content }] : []
  );
  const html = renderReportHtml({
    title,
    period: periodLabel,
    adminUrl,
    tiles: [
      {
        label: "Seitenaufrufe",
        value: total,
        delta: viewsDelta,
        spark: sparks.views,
        sparkImage: viewsSpark ? "cid:spark-views" : undefined,
      },
      {
        label: "Stempel gesetzt",
        value: stamps,
        delta: stampsDelta,
        spark: sparks.stamps,
        sparkImage: stampsSpark ? "cid:spark-stamps" : undefined,
      },
      {
        label: "Tage geöffnet",
        value: days,
        delta: daysDelta,
        spark: sparks.days,
        sparkImage: daysSpark ? "cid:spark-days" : undefined,
      },
      {
        label: "Meistbesuchte Seite",
        value: topPage?.[1] ?? 0,
        detail: topPage
          ? `${topPage[0]} · ${Math.round((topPage[1] / total) * 100)} %`
          : "—",
        share: topPage ? topPage[1] / total : 0,
      },
      {
        label: "Top-Quelle",
        value: topSource?.[1] ?? 0,
        detail: topSource
          ? `${topSource[0]} · ${Math.round((topSource[1] / sourceRows.length) * 100)} %`
          : "—",
        share: topSource ? topSource[1] / sourceRows.length : 0,
      },
    ],
    chart: {
      ...chart,
      image: png ? `cid:${CHART_ID}` : undefined,
      phoneImage: png && phonePng ? `cid:${CHART_ID}-phone` : undefined,
    },
    devices: byClass,
    devicesImage: ring ? "cid:devices-ring" : undefined,
    visits,
    sources: bySource,
    actions: actionList,
  });

  return {
    subject: `Boop · ${interval.label}-Statistik: ${total} Aufrufe, ${stamps} Stempel gesetzt`,
    text,
    html,
    total,
    inline,
  };
};
