import { SPARK_W } from "../chart-image";
import { C } from "../colors";

/**
 * The mail's building blocks – a card, a section's title, a gap, a word
 * for nothing – and the tiles with their figures, as tables and inline
 * styles.
 */

/** What comes from outside (paths, browser names) never goes raw into HTML. */
export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const fmt = (n: number) => n.toLocaleString("de-DE");

export const card = (inner: string, pad = "16px 18px") =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${C.card};border:1px solid ${C.cardEdge};border-radius:16px;"><tr><td style="padding:${pad};">${inner}</td></tr></table>`;

export const sectionTitle = (title: string, aside = "") =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 12px;"><tr>
    <td style="font-size:13px;font-weight:600;color:${C.ink};">${title}</td>
    <td style="font-size:12px;color:${C.muted};text-align:right;white-space:nowrap;">${aside}</td>
  </tr></table>`;

export const gap = (px: number) =>
  `<div style="height:${px}px;line-height:${px}px;font-size:1px;">&nbsp;</div>`;

export const empty = (text: string) =>
  `<div style="color:${C.muted};font-size:12px;">${text}</div>`;

export type Trend = "up" | "down" | "flat";

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

export const TREND_ICON: Record<Trend, string> = {
  up: "▲",
  down: "▼",
  flat: "■",
};
export const TREND_COLOR: Record<Trend, string> = {
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

export const tile = ({
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
