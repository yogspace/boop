"use client";

import { useSyncExternalStore } from "react";
import { deviceName } from "../visit-matrix";

export type ViewRow = {
  id?: string | number;
  createdAt: string;
  path?: string | null;
  referrer?: string | null;
  device?: string | null;
  os?: string | null;
  browser?: string | null;
};

export type ActionRow = {
  id?: string | number;
  createdAt: string;
  name: string;
  path?: string | null;
  device?: string | null;
};

export type AnalyticsData = {
  views: ViewRow[];
  actions: ActionRow[];
  lastDigestAt: string | null;
  /** How often the mail report goes out (sidebar → Email report). */
  reportInterval: string | null;
};

// Rows are pruned after 90 days, which also bounds what is loaded here.
export const DAYS = 90;
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One data state for all sections of the analytics global.
 *
 * The sections are UI fields of their own (each in its collapsible), which
 * Payload renders as siblings – no shared React context can be laid around
 * them. Without this store each would load the same 90 days again. Loaded
 * when the first section appears, on every opening; the old state stays
 * until the new one is there – no flicker back to “Loading”.
 */
type State = {
  data: AnalyticsData | null;
  busy: boolean;
  failed: boolean;
  /** The range EVERYTHING time-related in the global refers to. */
  range: Range;
  /** A point from the chart (an hour, a day) narrowing Visitors and Actions. */
  focus: Focus | null;
};

export type Focus = { from: number; to: number; label: string };

let state: State = {
  data: null,
  busy: false,
  failed: false,
  range: "today",
  focus: null,
};
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

const update = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
};

const docs = async <T>(url: string): Promise<T[]> => {
  const response = await fetch(url, { credentials: "include" });
  return response.ok ? (((await response.json()).docs as T[]) ?? []) : [];
};

const select = (fields: string[]) =>
  fields.map((field) => `select[${field}]=true`).join("&");

const reloadAnalytics = (): Promise<void> => {
  if (inflight) return inflight;
  inflight = (async () => {
    const since = encodeURIComponent(
      new Date(Date.now() - DAYS * DAY_MS).toISOString()
    );
    const query = `depth=0&limit=0&pagination=false&where[createdAt][greater_than_equal]=${since}`;
    try {
      const [views, actions, settingsResponse] = await Promise.all([
        docs<ViewRow>(
          `/api/page-views?${query}&${select(["path", "referrer", "device", "os", "browser", "createdAt"])}`
        ),
        docs<ActionRow>(
          `/api/actions?${query}&${select(["name", "path", "device", "createdAt"])}`
        ),
        fetch("/api/globals/analytics?depth=0", { credentials: "include" }),
      ]);
      const settings = settingsResponse.ok
        ? ((await settingsResponse.json()) as {
            lastDigestAt?: string | null;
            reportInterval?: string | null;
          })
        : {};
      update({
        data: {
          views,
          actions,
          lastDigestAt: settings.lastDigestAt ?? null,
          reportInterval: settings.reportInterval ?? null,
        },
        failed: false,
      });
    } catch {
      update({ failed: true });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  // The first section on the page starts loading – and brings back the range
  // chosen last. Only here, not at module load: that runs in the server
  // render too, which has no localStorage.
  if (listeners.size === 1) {
    const stored = readRange();
    if (stored !== state.range) queueMicrotask(() => update({ range: stored }));
    reloadAnalytics();
  }
  return () => {
    listeners.delete(listener);
  };
};

const snapshot = () => state;

export const useAnalytics = (): State =>
  useSyncExternalStore(subscribe, snapshot, snapshot);

// ─── Range ───────────────────────────────────────────────────────────────────

/**
 * “Today” from midnight, not the last 24 hours: the question is mostly “what
 * happened today”, and at 9 am half of last evening would belong to it.
 * “Since last report” is what the next mail report will contain.
 */
export type Range = "today" | "yesterday" | "7d" | "30d" | "report" | "90d";
const RANGE_VALUES: Range[] = [
  "today",
  "yesterday",
  "7d",
  "30d",
  "report",
  "90d",
];
const RANGE_KEY = "boop-analytics-range";

const readRange = (): Range => {
  try {
    const value = localStorage.getItem(RANGE_KEY) as Range | null;
    if (value && RANGE_VALUES.includes(value)) return value;
  } catch {
    // No storage (private window, blocked) – then the default.
  }
  return "today";
};

// Another range lifts the chart selection: it would mostly not be in it.
export const setRange = (range: Range) => {
  update({ range, focus: null });
  try {
    localStorage.setItem(RANGE_KEY, range);
  } catch {
    // Remembering is comfort, not a must.
  }
};

export const setFocus = (focus: Focus | null) => update({ focus });

export const rangeOptions = (lastDigestAt: string | null) =>
  [
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    ...(lastDigestAt ? [{ value: "report", label: "Since last report" }] : []),
    { value: "90d", label: "90 days" },
  ] as { value: Range; label: string }[];

// Midnight `days` calendar days ago – by the date, not 24-hour steps: at the
// clock change a day has 23 or 25 hours.
const midnight = (days: number, base = Date.now()): number => {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.getTime();
};

const shiftDays = (t: number, days: number) => {
  const d = new Date(t);
  d.setDate(d.getDate() - days);
  return d.getTime();
};

export type Window = {
  /** [from, to) – `to` is “now” for open ranges. */
  from: number;
  to: number;
  /** Open = runs on until now (deleting hits new rows too). */
  open: boolean;
  label: string;
  /** Hours up to three days, days beyond. */
  grain: "hour" | "day";
  /** The same span before – for the comparison in the tiles. */
  previous: { from: number; to: number; label: string } | null;
};

const lastDays = (days: number, label: string): Window => {
  const now = Date.now();
  return {
    from: midnight(days - 1),
    to: now,
    open: true,
    label,
    grain: days <= 3 ? "hour" : "day",
    previous:
      days * 2 <= DAYS
        ? {
            from: midnight(days * 2 - 1),
            to: shiftDays(now, days),
            label: `the ${days} days before`,
          }
        : null,
  };
};

export const rangeWindow = (
  range: Range,
  lastDigestAt: string | null
): Window => {
  const now = Date.now();
  const since = lastDigestAt ? new Date(lastDigestAt).getTime() : null;
  switch (range) {
    case "today":
      return {
        from: midnight(0),
        to: now,
        open: true,
        label: "Today",
        grain: "hour",
        // Against yesterday UP TO THE SAME TIME: at 9 am against all of
        // yesterday, every morning would look like a slump.
        previous: {
          from: midnight(1),
          to: shiftDays(now, 1),
          label: "yesterday by now",
        },
      };
    case "yesterday":
      return {
        from: midnight(1),
        to: midnight(0),
        open: false,
        label: "Yesterday",
        grain: "hour",
        previous: {
          from: midnight(2),
          to: midnight(1),
          label: "the day before",
        },
      };
    case "7d":
      return lastDays(7, "Last 7 days");
    case "30d":
      return lastDays(30, "Last 30 days");
    case "report":
      if (since) {
        return {
          from: since,
          to: now,
          open: true,
          label: `Since the last report (${new Date(since).toLocaleDateString("de-DE")})`,
          grain: now - since <= 3 * DAY_MS ? "hour" : "day",
          previous: {
            from: since - (now - since),
            to: since,
            label: "the period before",
          },
        };
      }
      break;
  }
  // 90 days – everything stored. There is no period before: the report cron
  // prunes older rows.
  return {
    from: now - DAYS * DAY_MS,
    to: now,
    open: true,
    label: "Last 90 days",
    grain: "day",
    previous: null,
  };
};

// ─── Time slots ──────────────────────────────────────────────────────────────

const two = (n: number) => String(n).padStart(2, "0");
const weekdayDay = (d: Date) =>
  d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });

/** An hour or a day of the range – where the charts count. */
export type Slot = {
  from: number;
  to: number;
  /** Axis label, shown where `tick` is set. */
  label: string;
  /** Long name: “Do., 09.10., 13:00–14:00”. */
  title: string;
  tick: boolean;
  /** Still running (this hour, today). */
  partial: boolean;
};

/**
 * The range in hours (up to three days) or days – EVERY one, even without
 * rows: without the empty ones the course would look denser than it was.
 * Counted on by the date, not fixed milliseconds: at the clock change a day
 * has 23 or 25 hours.
 */
export const timeSlots = (w: Window): Slot[] => {
  const floor = (t: number) => {
    const d = new Date(t);
    if (w.grain === "hour") d.setMinutes(0, 0, 0);
    else d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const multiDay = w.to - w.from > DAY_MS + 60 * 60 * 1000;
  const out: Slot[] = [];
  const cursor = new Date(floor(w.from));
  while (cursor.getTime() < w.to) {
    const from = cursor.getTime();
    const d = new Date(from);
    if (w.grain === "hour") {
      const h = d.getHours();
      cursor.setHours(cursor.getHours() + 1);
      out.push({
        from,
        to: cursor.getTime(),
        label: multiDay && h === 0 ? weekdayDay(d) : `${two(h)}:00`,
        title: `${weekdayDay(d)}, ${two(h)}:00–${two((h + 1) % 24)}:00`,
        tick: multiDay ? h % 12 === 0 : h % 3 === 0,
        partial: false,
      });
    } else {
      cursor.setDate(cursor.getDate() + 1);
      out.push({
        from,
        to: cursor.getTime(),
        label: d
          .toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })
          .replace(/\.$/, ""),
        title: weekdayDay(d),
        tick: true,
        partial: false,
      });
    }
  }
  const last = out.at(-1);
  if (w.open && last) last.partial = true;
  if (w.grain === "day" && out.length > 10) {
    const every = out.length > 40 ? 14 : 7;
    out.forEach((slot, i) => {
      slot.tick = i % every === 0 || i === out.length - 1;
    });
  }
  return out;
};

/** How many rows fall into each slot. */
export const countInSlots = (
  slots: Pick<Slot, "from" | "to">[],
  rows: { createdAt: string }[]
) => {
  const counts = slots.map(() => 0);
  if (slots.length === 0) return counts;
  const start = slots[0].from;
  for (const row of rows) {
    const at = new Date(row.createdAt).getTime();
    if (at < start) continue;
    // Slots are in order – a binary search would do, but they are few.
    const i = slots.findIndex((slot) => at >= slot.from && at < slot.to);
    if (i >= 0) counts[i]++;
  }
  return counts;
};

export const inWindow =
  (from: number, to: number) =>
  (row: { createdAt: string }): boolean => {
    const at = new Date(row.createdAt).getTime();
    return at >= from && at < to;
  };

/**
 * Runs an action (deleting) and reloads afterwards. While it runs, the
 * buttons in ALL sections are locked – they share the data, so also the
 * moment it is not right.
 */
const run = async (action: () => Promise<unknown>) => {
  update({ busy: true });
  try {
    await action();
    await reloadAnalytics();
  } finally {
    update({ busy: false });
  }
};

/**
 * Deletes page views and actions – those in the range or all. An open range
 * (until now) has no upper bound: what came in between loading and the click
 * belongs to it just as much.
 */
export const deleteRows = (
  window: Pick<Window, "from" | "to" | "open"> | "all"
) => {
  const iso = (t: number) => encodeURIComponent(new Date(t).toISOString());
  const where =
    window === "all"
      ? "where[createdAt][exists]=true"
      : `where[createdAt][greater_than_equal]=${iso(window.from)}${
          window.open ? "" : `&where[createdAt][less_than]=${iso(window.to)}`
        }`;
  return run(() =>
    Promise.all(
      ["page-views", "actions"].map((collection) =>
        fetch(`/api/${collection}?${where}`, {
          method: "DELETE",
          credentials: "include",
        })
      )
    )
  );
};

const idsOf = (list: { id?: string | number }[]) =>
  list.flatMap((row) => (row.id === undefined ? [] : [String(row.id)]));

/** The page views of ONE device profile – for the question before deleting. */
export const deviceRows = (device: string) =>
  idsOf((state.data?.views ?? []).filter((row) => deviceName(row) === device));

/**
 * Deletes all page views of a device profile – one's own devices from the
 * time before “Own devices”. By the loaded rows' ids, in packs, so the
 * address does not grow without bound.
 */
export const resetDevice = (device: string) => {
  const ids = deviceRows(device);
  return run(async () => {
    for (let at = 0; at < ids.length; at += 50) {
      const query = ids
        .slice(at, at + 50)
        .map((id, index) => `where[id][in][${index}]=${encodeURIComponent(id)}`)
        .join("&");
      await fetch(`/api/page-views?${query}`, {
        method: "DELETE",
        credentials: "include",
      });
    }
  });
};
