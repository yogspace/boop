import type { Visit } from "../visit-matrix";
import type { ReportBucket } from "./buckets";
import { CHART_W, PHONE_W } from "./chart-image";
import { C } from "./colors";
import {
  card,
  empty,
  escapeHtml,
  fmt,
  gap,
  sectionTitle,
  type Tile,
  tile,
} from "./email/blocks";
import { chartHtml } from "./email/chart";
import {
  actionsHtml,
  devicesHtml,
  type ReportAction,
  rankList,
} from "./email/lists";
import { matrixHtml } from "./email/matrix";

/**
 * The mail report as HTML – tiles, chart, heatmap, lists: white cards on
 * warm paper, ink text, indigo for the data, a soft red for what went down.
 *
 * Built for mail programs, not browsers: tables and inline styles only, no
 * grid, no flexbox, no CSS variables, no script. Where a program cannot do
 * something (rounded corners in classic Outlook), it falls back to a quiet
 * surface instead of breaking. `color-scheme: light` so mail programs do not
 * darken and recolor it.
 *
 * The parts, in email/: the building blocks and tiles (blocks.ts), the
 * columns (chart.ts), the heatmap (matrix.ts) and the lists (lists.ts).
 */

export { compare, type Delta, type Tile } from "./email/blocks";
export { deviceParts, type ReportAction } from "./email/lists";

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

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
