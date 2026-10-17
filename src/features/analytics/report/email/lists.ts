import { groupActions } from "../../actions";
import { RING_SIZE } from "../chart-image";
import { C, DEVICES } from "../colors";
import {
  empty,
  escapeHtml,
  fmt,
  TREND_COLOR,
  TREND_ICON,
  type Trend,
} from "./blocks";

/**
 * The lists: the sources as a ranking, the devices as a ring or a stacked
 * bar, and the actions against the period before.
 */

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
export const rankList = (entries: [string, number][], limit = 8) => {
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
export const devicesHtml = (devices: [string, number][], ring?: string) => {
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

export type ReportAction = {
  /** Its key (analytics/actions.ts) – for the groups. */
  name: string;
  label: string;
  count: number;
  before: number;
};

/**
 * Each action as an indigo bar for now and a thin gray one for before, on
 * one scale, the change as a number with an arrow – grouped like in the
 * admin (analytics/actions.ts).
 */
export const actionsHtml = (actions: ReportAction[]) => {
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
