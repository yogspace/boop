import { pathName } from "../../page-names";
import {
  buildVisitMatrix,
  OTHER,
  type Visit,
  visitShade,
} from "../../visit-matrix";
import { berlinStamp } from "../buckets";
import { C, RAMP, RAMP_LIGHT_INK_FROM } from "../colors";
import { empty, escapeHtml } from "./blocks";

/** The heatmap: which pages were seen on which devices, and when last. */

/** Row name: page and language instead of the path. */
const rowName = (key: string) => {
  const name = pathName(key, "de");
  return name
    ? `<span style="color:${C.text};">${escapeHtml(name.label)}</span> <span style="color:${C.muted};font-size:10px;font-weight:600;letter-spacing:0.04em;">${escapeHtml(name.locale.toUpperCase())}</span>`
    : `<span style="color:${C.text};">${escapeHtml(key)}</span>`;
};

/**
 * Pages × devices – the admin's grid (analytics/visit-matrix.ts), without
 * clicking. Four device columns: a grid scrolling sideways in a mail
 * program nobody reads; the rest stands in “Andere”.
 */
export const matrixHtml = (visits: Visit[]) => {
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
