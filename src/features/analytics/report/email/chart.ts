import type { ReportBucket } from "../buckets";
import { C } from "../colors";
import { escapeHtml, fmt } from "./blocks";

/** The views over time as columns – when the picture could not be drawn. */

const PLOT_H = 110;

/**
 * Columns as a table – every column a cell, the bar a block of fixed height:
 * the form every mail program draws the same. The fallback when the chart
 * picture could not be drawn. A number only at the tallest bar; the running
 * hour or day lighter. With `before`, the same hour or day of the period
 * before stands as a gray column beside each.
 */
export const chartHtml = (buckets: ReportBucket[], before?: number[]) => {
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
