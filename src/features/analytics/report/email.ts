import { groupActions } from "../actions";
import { pathName } from "../page-names";
import {
  buildVisitMatrix,
  OTHER,
  type Visit,
  visitShade,
} from "../visit-matrix";
import { berlinStamp, type ReportBucket } from "./buckets";
import { CHART_W, PHONE_W, RING_SIZE, SPARK_W } from "./chart-image";
import { C, DEVICES, RAMP, RAMP_LIGHT_INK_FROM } from "./colors";

/**
 * The mail report as HTML – tiles, chart, heatmap, lists: white cards on
 * warm paper, ink text, indigo for the data, a soft red for what went down.
 *
 * Built for mail programs, not browsers: tables and inline styles only, no
 * grid, no flexbox, no CSS variables, no script. Where a program cannot do
 * something (rounded corners in classic Outlook), it falls back to a quiet
 * surface instead of breaking. `color-scheme: light` so mail programs do not
 * darken and recolor it.
 */

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** What comes from outside (paths, browser names) never goes raw into HTML. */
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmt = (n: number) => n.toLocaleString("de-DE");

// ─── Building blocks ─────────────────────────────────────────────────────────

const card = (inner: string, pad = "16px 18px") =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${C.card};border:1px solid ${C.cardEdge};border-radius:16px;"><tr><td style="padding:${pad};">${inner}</td></tr></table>`;

const sectionTitle = (title: string, aside = "") =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 12px;"><tr>
    <td style="font-size:13px;font-weight:600;color:${C.ink};">${title}</td>
    <td style="font-size:12px;color:${C.muted};text-align:right;white-space:nowrap;">${aside}</td>
  </tr></table>`;

const gap = (px: number) =>
  `<div style="height:${px}px;line-height:${px}px;font-size:1px;">&nbsp;</div>`;

const empty = (text: string) =>
  `<div style="color:${C.muted};font-size:12px;">${text}</div>`;

type Trend = "up" | "down" | "flat";

export type Delta = { text: string; trend: Trend };

/** Against the same span before – as in the admin's tiles. */
export const compare = (now: number, before: number | null): Delta | null => {
  if (before === null) return null;
  // Short, so it fits one line in the narrow tile on a phone.
  if (before === 0) {
    return now > 0
      ? { text: "vorher 0", trend: "up" }
      : { text: "auch vorher 0", trend: "flat" };
  }
  const change = Math.round(((now - before) / before) * 100);
  return {
    text: `${change > 0 ? "+" : ""}${change} % · vorher ${fmt(before)}`,
    trend: change > 0 ? "up" : change < 0 ? "down" : "flat",
  };
};

const TREND_ICON: Record<Trend, string> = { up: "▲", down: "▼", flat: "■" };
const TREND_COLOR: Record<Trend, string> = {
  up: C.data,
  down: C.down,
  flat: C.muted,
};

export type Tile = {
  label: string;
  value: number;
  detail?: string;
  delta?: Delta | null;
  /** Its course over the period – small columns under the number … */
  spark?: number[];
  /** … or, where it could be drawn, as a picture (`cid:…`). */
  sparkImage?: string;
  /** Its share of a whole (0…1) – a thin track under the number. */
  share?: number;
};

/**
 * A figure's course as tiny columns – gray, the last one indigo, like the
 * admin's sparklines. Cells, not a picture: every mail program draws them.
 */
const sparkHtml = (values: number[]) => {
  if (values.length < 2) return "";
  const max = Math.max(...values, 1);
  const H = 22;
  const cells = values
    .map((v, i) => {
      const h = v ? Math.max(2, Math.round((v / max) * H)) : 1;
      const color = i === values.length - 1 ? C.data : v ? C.before : C.track;
      return `<td valign="bottom" style="vertical-align:bottom;height:${H}px;padding:0 ${values.length > 40 ? 0 : 1}px;"><div style="height:${h}px;line-height:${h}px;font-size:1px;background:${color};border-radius:1px;">&nbsp;</div></td>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-collapse:collapse;margin-top:10px;"><tr>${cells}</tr></table>`;
};

/** A share as a thin track – for “63 of 223 views”. */
const meterHtml = (share: number) => {
  const pct = Math.max(2, Math.min(100, Math.round(share * 100)));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin-top:12px;"><tr>
    <td width="${pct}%" style="height:6px;line-height:6px;font-size:1px;background:${C.data};border-radius:3px;">&nbsp;</td>
    ${pct < 100 ? `<td style="height:6px;line-height:6px;font-size:1px;background:${C.track};border-radius:3px;">&nbsp;</td>` : ""}
  </tr></table>`;
};

const tile = ({
  label,
  value,
  detail,
  delta,
  spark,
  sparkImage,
  share,
}: Tile) => {
  const sub = delta
    ? `<div style="font-size:11px;line-height:15px;color:${TREND_COLOR[delta.trend]};padding-top:6px;"><span style="font-size:8px;">${TREND_ICON[delta.trend]}</span> ${escapeHtml(delta.text)}</div>`
    : detail
      ? `<div style="font-size:11px;line-height:15px;color:${C.muted};padding-top:6px;">${escapeHtml(detail)}</div>`
      : "";
  return card(
    `<div style="font-size:11px;line-height:14px;color:${C.muted};">${label}</div>
     <div style="font-size:26px;line-height:32px;font-weight:700;color:${C.ink};padding-top:4px;letter-spacing:-0.01em;">${fmt(value)}</div>
     ${sub}${sparkImage ? `<img src="${escapeHtml(sparkImage)}" width="${SPARK_W}" alt="" style="display:block;width:100%;max-width:${SPARK_W}px;height:auto;border:0;margin-top:10px;">` : spark ? sparkHtml(spark) : ""}${share !== undefined ? meterHtml(share) : ""}`,
    "14px 16px"
  );
};

// ─── Column chart ────────────────────────────────────────────────────────────

const PLOT_H = 110;

/**
 * Columns as a table – every column a cell, the bar a block of fixed height:
 * the form every mail program draws the same. The fallback when the chart
 * picture could not be drawn. A number only at the tallest bar; the running
 * hour or day lighter. With `before`, the same hour or day of the period
 * before stands as a gray column beside each.
 */
const chartHtml = (buckets: ReportBucket[], before?: number[]) => {
  const n = buckets.length;
  const max = Math.max(...buckets.map((b) => b.count), ...(before ?? []), 1);
  const peak = buckets.findIndex((b) => b.count === max && b.count > 0);
  const pad = n > 48 ? 0 : 1;
  // Narrow bars like in the admin (at most 24 px); `max-width` so it fits
  // the narrower cell on a phone.
  const barW = Math.max(3, Math.min(24, Math.round((520 / n) * 0.65)));

  const bars = buckets
    .map((b, i) => {
      const h = b.count ? Math.max(3, Math.round((b.count / max) * PLOT_H)) : 0;
      const label =
        i === peak
          ? `<div style="font-size:10px;line-height:12px;color:${C.text};text-align:center;white-space:nowrap;padding-bottom:3px;">${fmt(b.count)}</div>`
          : "";
      const fill = b.partial ? C.dataSoft : C.data;
      if (before) {
        // Side by side in a little table: gray before, indigo now.
        const was = before[i] ?? 0;
        const bh = was ? Math.max(3, Math.round((was / max) * PLOT_H)) : 0;
        const ghost = bh
          ? `<div style="height:${bh}px;line-height:${bh}px;font-size:1px;background:${C.before};border-radius:2px 2px 0 0;">&nbsp;</div>`
          : "";
        const nowBar = h
          ? `<div style="height:${h}px;line-height:${h}px;font-size:1px;background:${fill};border-radius:2px 2px 0 0;">&nbsp;</div>`
          : "";
        return `<td valign="bottom" style="vertical-align:bottom;height:${PLOT_H + 16}px;padding:0 ${pad}px;">${label}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-collapse:collapse;"><tr><td valign="bottom" style="vertical-align:bottom;width:40%;padding-right:1px;">${ghost}</td><td valign="bottom" style="vertical-align:bottom;width:60%;">${nowBar}</td></tr></table></td>`;
      }
      const bar = h
        ? `<div style="height:${h}px;line-height:${h}px;font-size:1px;width:${barW}px;max-width:100%;margin:0 auto;background:${fill};border-radius:3px 3px 0 0;">&nbsp;</div>`
        : "";
      return `<td valign="bottom" style="vertical-align:bottom;height:${PLOT_H + 16}px;padding:0 ${pad}px;">${label}${bar}</td>`;
    })
    .join("");

  // Labels: one cell per tick, reaching to the next.
  const labels: string[] = [];
  for (let i = 0; i < n; ) {
    let j = i + 1;
    while (j < n && !buckets[j].tick) j++;
    labels.push(
      `<td colspan="${j - i}" style="padding:6px 0 0;font-size:10px;line-height:12px;color:${C.muted};white-space:nowrap;text-align:left;">${buckets[i].tick ? escapeHtml(buckets[i].label) : "&nbsp;"}</td>`
    );
    i = j;
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-collapse:collapse;">
    <tr>${bars}</tr>
    <tr><td colspan="${n}" style="height:1px;line-height:1px;font-size:1px;background:${C.line};">&nbsp;</td></tr>
    <tr>${labels.join("")}</tr>
  </table>`;
};

// ─── Heatmap ─────────────────────────────────────────────────────────────────

/** Row name: page and language instead of the path. */
const rowName = (key: string) => {
  const name = pathName(key, "de");
  return name
    ? `<span style="color:${C.text};">${escapeHtml(name.label)}</span> <span style="color:${C.muted};font-size:10px;font-weight:600;letter-spacing:0.04em;">${escapeHtml(name.locale.toUpperCase())}</span>`
    : `<span style="color:${C.text};">${escapeHtml(key)}</span>`;
};

/**
 * Pages × devices – the admin's grid (visit-matrix.ts), without clicking.
 * Four device columns: a grid scrolling sideways in a mail program nobody
 * reads; the rest stands in “Andere”.
 */
const matrixHtml = (visits: Visit[]) => {
  if (!visits.length) return empty("Keine Aufrufe im Zeitraum.");
  const { columns, rows, cell, columnTotal, max } = buildVisitMatrix(visits, {
    rowAxis: "page",
    maxColumns: 4,
  });

  const head = columns
    .map((col) => {
      const [first, ...rest] = col === OTHER ? ["Andere"] : col.split(" · ");
      return `<td class="r-mx-cell" style="padding:0 2px 8px;text-align:center;vertical-align:bottom;font-size:11px;line-height:14px;color:${C.text};">${escapeHtml(first)}${rest
        .map(
          (part) =>
            `<br><span style="color:${C.muted};font-size:10px;">${escapeHtml(part)}</span>`
        )
        .join("")}</td>`;
    })
    .join("");

  const body = rows
    .slice(0, 12)
    .map(([row, total]) => {
      const cells = columns
        .map((col) => {
          const value = cell(row, col);
          if (!value) {
            return `<td class="r-mx-cell" style="padding:3px 2px;text-align:center;color:${C.empty};font-size:12px;">·</td>`;
          }
          const index = Math.max(
            0,
            Math.min(
              RAMP.length - 1,
              Math.ceil(visitShade(value.count, max) * RAMP.length) - 1
            )
          );
          const ink = index >= RAMP_LIGHT_INK_FROM ? "#ffffff" : C.ink;
          return `<td class="r-mx-cell" style="padding:3px 2px;"><div title="${value.count} · zuletzt ${berlinStamp(value.lastAt)}" style="background:${RAMP[index]};color:${ink};border-radius:6px;text-align:center;font-size:12px;line-height:26px;font-weight:600;">${value.count}</div></td>`;
        })
        .join("");
      return `<tr>
        <td class="r-mx-label" style="padding:5px 10px 5px 0;vertical-align:middle;border-top:1px solid ${C.line};font-size:12px;line-height:16px;">
          ${rowName(row)}<br>
          <span class="r-wrap" style="color:${C.muted};font-size:10px;white-space:nowrap;">${total.count} · zuletzt ${berlinStamp(total.lastAt)}</span>
        </td>${cells}</tr>`;
    })
    .join("");

  const foot = columns
    .map((col) => {
      const total = columnTotal(col);
      return `<td class="r-mx-cell" style="padding:8px 2px 0;text-align:center;font-size:10px;line-height:13px;color:${C.muted};border-top:1px solid ${C.line};">${
        total
          ? `<span style="color:${C.text};font-size:12px;font-weight:600;">${total.count}</span><br>${berlinStamp(total.lastAt)}`
          : ""
      }</td>`;
    })
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr><td></td>${head}</tr>
    ${body}
    <tr><td style="padding:8px 10px 0 0;font-size:10px;line-height:13px;color:${C.muted};border-top:1px solid ${C.line};">${visits.length} gesamt<br>je Gerät · zuletzt</td>${foot}</tr>
  </table>`;
};

// ─── Lists ───────────────────────────────────────────────────────────────────

/** A bar of `pct` % on an empty track, `h` px high. */
const barHtml = (pct: number, color: string, h: number) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>${
    // Nothing is nothing – no stub for a zero.
    pct > 0
      ? `<td width="${Math.max(1, pct)}%" style="height:${h}px;line-height:${h}px;font-size:1px;background:${color};border-radius:0 ${h / 2}px ${h / 2}px 0;">&nbsp;</td>`
      : ""
  }<td style="height:${h}px;line-height:${h}px;font-size:1px;">&nbsp;</td></tr></table>`;

/**
 * Ranking as bars from one baseline, the number and the share beside –
 * like the admin's lists.
 */
const rankList = (entries: [string, number][], limit = 8) => {
  if (!entries.length) return empty("Nichts im Zeitraum.");
  const max = Math.max(...entries.map(([, n]) => n), 1);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${entries
    .slice(0, limit)
    .map(
      ([name, count]) => `<tr>
        <td style="padding:8px 12px 8px 0;font-size:12px;line-height:16px;color:${C.text};">${escapeHtml(name)}
          <div style="padding-top:5px;">${barHtml(Math.round((count / max) * 100), C.data, 6)}</div>
        </td>
        <td style="padding:8px 0;font-size:13px;font-weight:600;color:${C.ink};text-align:right;white-space:nowrap;vertical-align:top;">${fmt(count)} <span style="font-size:11px;font-weight:400;color:${C.muted};">${Math.round((count / total) * 100)} %</span></td>
      </tr>`
    )
    .join("")}</table>`;
};

/**
 * The device classes in their fixed colors, the rest as “Andere” – for the
 * stacked bar and the ring picture alike.
 */
export const deviceParts = (devices: [string, number][]) => {
  const merged = new Map<string, number>();
  for (const [key, count] of devices) {
    const name = DEVICES[key] ? key : "other";
    merged.set(name, (merged.get(name) ?? 0) + count);
  }
  return [...Object.keys(DEVICES), "other"]
    .filter((key) => merged.has(key))
    .map((key) => ({
      name: DEVICES[key]?.name ?? "Andere",
      color: DEVICES[key]?.color ?? C.before,
      count: merged.get(key) ?? 0,
    }));
};

/**
 * The device classes as the ring picture with the legend beside it – or,
 * without the picture, as ONE stacked bar – every number and share in the
 * legend.
 */
const devicesHtml = (devices: [string, number][], ring?: string) => {
  const total = devices.reduce((sum, [, n]) => sum + n, 0);
  if (!total) return empty("Keine Aufrufe im Zeitraum.");
  const parts = deviceParts(devices);
  const segments = parts
    .map(
      (part, i) =>
        `<td width="${Math.max(1, Math.round((part.count / total) * 100))}%" style="height:14px;line-height:14px;font-size:1px;background:${part.color};${i < parts.length - 1 ? `border-right:2px solid ${C.card};` : ""}${i === 0 ? "border-radius:7px 0 0 7px;" : ""}${i === parts.length - 1 ? "border-radius:0 7px 7px 0;" : ""}${parts.length === 1 ? "border-radius:7px;" : ""}">&nbsp;</td>`
    )
    .join("");
  const legend = parts
    .map(
      (part) => `<tr>
        <td style="padding:7px 0 0;font-size:12px;line-height:16px;color:${C.text};"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${part.color};margin-right:6px;"></span>${part.name}</td>
        <td style="padding:7px 0 0;font-size:13px;font-weight:600;color:${C.ink};text-align:right;white-space:nowrap;">${fmt(part.count)} <span style="font-size:11px;font-weight:400;color:${C.muted};">${Math.round((part.count / total) * 100)} %</span></td>
      </tr>`
    )
    .join("");
  const legendTable = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:6px;">${legend}</table>`;
  if (ring) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
      <td width="${RING_SIZE}" style="width:${RING_SIZE}px;vertical-align:middle;padding-right:18px;"><img src="${escapeHtml(ring)}" width="${RING_SIZE}" height="${RING_SIZE}" alt="Geräte: ${parts.map((p) => `${p.name} ${p.count}`).join(", ")}" style="display:block;width:${RING_SIZE}px;height:${RING_SIZE}px;border:0;"></td>
      <td style="vertical-align:middle;">${legendTable}</td>
    </tr></table>`;
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;"><tr>${segments}</tr></table>${legendTable}`;
};

/**
 * Each action as an indigo bar for now and a thin gray one for before, on
 * one scale, the change as a number with an arrow – grouped like in the
 * admin (actions.ts).
 */
const actionsHtml = (actions: ReportAction[]) => {
  if (!actions.length) return empty("Nichts im Zeitraum.");
  const max = Math.max(...actions.map((a) => Math.max(a.count, a.before)), 1);
  const byName = new Map(actions.map((a) => [a.name, a]));
  const groups = groupActions(
    actions.map((a) => a.name),
    "de"
  ).map((group) => ({
    title: group.title,
    items: group.names.flatMap((name) => byName.get(name) ?? []),
  }));
  const groupHtml = (list: typeof groups) =>
    list
      .map(
        (
          group
        ) => `<div style="font-size:10px;line-height:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};padding:10px 0 2px;">${escapeHtml(group.title)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${group.items
        .map((a) => {
          const diff = a.count - a.before;
          const trend: Trend = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
          const change =
            diff === 0
              ? "wie vorher"
              : `${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))}`;
          return `<tr>
            <td style="padding:7px 12px 7px 0;font-size:12px;line-height:16px;color:${C.text};">${escapeHtml(a.label)}
              <div style="padding-top:5px;">${barHtml(Math.round((a.count / max) * 100), C.data, 6)}</div>
              <div style="padding-top:2px;">${barHtml(Math.round((a.before / max) * 100), C.before, 3)}</div>
            </td>
            <td style="padding:7px 0;text-align:right;white-space:nowrap;vertical-align:top;font-size:13px;font-weight:600;color:${C.ink};">${fmt(a.count)}<div style="font-size:10px;font-weight:400;color:${TREND_COLOR[trend]};padding-top:2px;"><span style="font-size:7px;">${TREND_ICON[trend]}</span> ${change}</div></td>
          </tr>`;
        })
        .join("")}</table>`
      )
      .join("");
  // Two columns, balanced by rows – the groups stay whole: split where the
  // two sides come closest.
  const sizes = groups.map((group) => group.items.length + 1);
  const rows = sizes.reduce((sum, n) => sum + n, 0);
  let split = 1;
  let filled = 0;
  let best = Number.POSITIVE_INFINITY;
  sizes.forEach((size, i) => {
    filled += size;
    const off = Math.abs(2 * filled - rows);
    if (off < best && i < sizes.length - 1) {
      best = off;
      split = i + 1;
    }
  });
  const left = groups.slice(0, split);
  const right = groups.slice(split);
  if (!right.length) return groupHtml(left);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;"><tr>
    <td class="r-col" width="50%" style="width:50%;vertical-align:top;padding:0 14px 0 0;">${groupHtml(left)}</td>
    <td class="r-col" width="50%" style="width:50%;vertical-align:top;padding:0 0 0 14px;">${groupHtml(right)}</td>
  </tr></table>`;
};

// ─── The mail ────────────────────────────────────────────────────────────────

export type ReportAction = {
  /** Its key (actions.ts) – for the groups. */
  name: string;
  label: string;
  count: number;
  before: number;
};

export type ReportData = {
  /** “Wochenreport” … */
  title: string;
  period: string;
  adminUrl: string;
  /** Five tiles: three in the first row, two in the second. */
  tiles: Tile[];
  chart: {
    grain: "hour" | "day";
    buckets: ReportBucket[];
    /** The same hours or days of the period before. */
    before?: number[];
    /** The chart as a picture (`cid:…`) – without it, columns … */
    image?: string;
    /** … and the phone's narrower one. */
    phoneImage?: string;
  };
  /** Page views by device class … */
  devices: [string, number][];
  /** … and as a ring picture (`cid:…`), if it could be drawn. */
  devicesImage?: string;
  visits: Visit[];
  sources: [string, number][];
  actions: ReportAction[];
};

/**
 * Line breaks between tags away – the template is indented for reading, the
 * mail need not be (Gmail clips mails above 102 KB). Only whitespace WITH a
 * line break: a single space between two spans belongs to the text.
 */
const compact = (html: string) => html.replace(/>\s*\n\s*</g, "><").trim();

/** Width of the mail on large screens. */
const MAX_W = 960;

/**
 * The responsive part – as a media query in <head>, inline styles know none.
 * Apple Mail, iOS, Gmail and Outlook.com read it; classic Outlook keeps the
 * desktop grid. On the phone: tiles one below the other, less margin.
 */
const RESPONSIVE_CSS = `
@media only screen and (max-width: 620px) {
  .r-outer { padding: 20px 10px 32px !important; }
  .r-col { display: block !important; width: 100% !important; padding: 0 0 10px 0 !important; box-sizing: border-box !important; }
  .r-hide { display: none !important; }
  .r-mx-label { padding-right: 4px !important; }
  .r-mx-cell { padding-left: 1px !important; padding-right: 1px !important; }
  .r-wrap { white-space: normal !important; }
  .r-show { display: block !important; max-height: none !important; overflow: visible !important; }
}
`;

const renderHtml = (r: ReportData): string => {
  // `r-col`: one below the other on the phone (media query).
  const col = (inner: string, side: "left" | "mid" | "right") =>
    `<td class="r-col" width="33.33%" style="width:33.33%;vertical-align:top;padding:${
      side === "left" ? "0 5px 0 0" : side === "right" ? "0 0 0 5px" : "0 5px"
    };">${inner}</td>`;
  const sides = ["left", "mid", "right"] as const;
  const row = (tiles: Tile[]) =>
    `<tr>${tiles.map((t, i) => col(tile(t), sides[i])).join("")}${
      tiles.length < 3 ? '<td class="r-hide"></td>' : ""
    }</tr>`;

  const kpis = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;">
    ${row(r.tiles.slice(0, 3))}
    <tr class="r-hide"><td colspan="3">${gap(10)}</td></tr>
    ${row(r.tiles.slice(3, 6))}
  </table>`;

  const chartTotal = r.chart.buckets.reduce((sum, b) => sum + b.count, 0);
  const beforeTotal = (r.chart.before ?? []).reduce((sum, n) => sum + n, 0);
  const key = (color: string, text: string) =>
    `<span style="display:inline-block;width:10px;height:3px;border-radius:2px;background:${color};vertical-align:middle;margin:0 5px 2px 12px;"></span>${text}`;
  const chartAlt = `Seitenaufrufe: ${fmt(chartTotal)} im Zeitraum${r.chart.before ? `, ${fmt(beforeTotal)} davor` : ""}`;
  const chart = card(
    `${sectionTitle(
      r.chart.grain === "hour"
        ? "Seitenaufrufe pro Stunde"
        : "Seitenaufrufe pro Tag",
      `${key(C.data, `${fmt(chartTotal)} jetzt`)}${r.chart.before ? key(C.before, `${fmt(beforeTotal)} davor`) : ""}`
    )}${
      !(chartTotal || beforeTotal)
        ? empty("Keine Aufrufe im Zeitraum.")
        : r.chart.image
          ? `<img class="${r.chart.phoneImage ? "r-hide" : ""}" src="${escapeHtml(r.chart.image)}" width="${CHART_W}" alt="${chartAlt}" style="display:block;width:100%;max-width:${CHART_W}px;height:auto;border:0;">${
              r.chart.phoneImage
                ? // Only on the phone (media query); hidden everywhere else,
                  // classic Outlook included.
                  `<!--[if !mso]><!--><div class="r-show" style="display:none;max-height:0;overflow:hidden;mso-hide:all;"><img src="${escapeHtml(r.chart.phoneImage)}" width="${PHONE_W}" alt="${chartAlt}" style="display:block;width:100%;max-width:${PHONE_W}px;height:auto;border:0;"></div><!--<![endif]-->`
                : ""
            }`
          : chartHtml(r.chart.buckets, beforeTotal ? r.chart.before : undefined)
    }`
  );

  const matrix = card(
    `${sectionTitle("Seiten × Geräte")}${matrixHtml(r.visits)}`
  );
  const sources = card(
    `${sectionTitle("Quellen", "ohne interne Navigation")}${rankList(r.sources)}`
  );
  const devices = card(
    `${sectionTitle("Geräte")}${devicesHtml(r.devices, r.devicesImage)}`
  );
  const actions = card(
    `${sectionTitle("Aktionen", `${key(C.data, "jetzt")}${key(C.before, "davor")}`)}${actionsHtml(r.actions)}`
  );
  // Devices and sources side by side – one below the other on the phone.
  const pair = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;"><tr>
    <td class="r-col" width="50%" style="width:50%;vertical-align:top;padding:0 5px 0 0;">${devices}</td>
    <td class="r-col" width="50%" style="width:50%;vertical-align:top;padding:0 0 0 5px;">${sources}</td>
  </tr></table>`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(r.title)}</title>
<style>${RESPONSIVE_CSS}</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${C.bg};">
<tr><td class="r-outer" align="center" style="padding:32px 16px 44px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:${MAX_W}px;font-family:${FONT};color:${C.text};">

  <tr><td style="padding:0 4px 18px;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${C.muted};">Boop · Analytics</td></tr>

  <tr><td style="padding:0 4px 20px;">
    <div style="font-size:30px;line-height:36px;font-weight:800;color:${C.ink};letter-spacing:-0.02em;">${escapeHtml(r.title)}</div>
    <div style="font-size:13px;line-height:18px;color:${C.muted};padding-top:4px;">${escapeHtml(r.period)}</div>
  </td></tr>

  <tr><td>${kpis}</td></tr>
  <tr><td>${gap(10)}</td></tr>
  <tr><td>${chart}</td></tr>
  <tr><td>${gap(10)}</td></tr>
  <tr><td>${actions}</td></tr>
  <tr><td>${gap(10)}</td></tr>
  <tr><td>${pair}</td></tr>
  <tr><td>${gap(10)}</td></tr>
  <tr><td>${matrix}</td></tr>

  <tr><td style="padding:28px 4px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;"><tr>
      <td style="background:${C.data};border-radius:999px;">
        <a href="${escapeHtml(r.adminUrl)}" style="display:inline-block;padding:12px 20px;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;">Analytics im Admin öffnen →</a>
      </td>
    </tr></table>
    <div style="font-size:11px;line-height:16px;color:${C.muted};padding-top:12px;">Anonyme Statistik – keine IP, nichts auf den Geräten der Besucher gespeichert.</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
};

export const renderReportHtml = (r: ReportData): string =>
  compact(renderHtml(r));
