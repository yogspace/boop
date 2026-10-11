import type { BasePayload } from "payload";
import { sendMail } from "@/lib/mail";
import { DAY_MS, HOUR_MS } from "./buckets";
import { buildDigest } from "./digest";

/**
 * One run of the report cron (/next/cron/stats-digest): prunes old rows,
 * then sends the report – but only when the interval set in the admin
 * (analytics global → Email report) is due, tracked by lastDigestAt.
 *
 * `force` (the “send now” button): ignores interval and “off” and does NOT
 * move lastDigestAt, so the regular cadence stays.
 */

/** How long page views and actions are kept. */
const RETENTION_MS = 90 * DAY_MS;

const INTERVAL: Record<
  string,
  { minElapsedMs: number; windowMs: number; label: string }
> = {
  daily: { minElapsedMs: 20 * HOUR_MS, windowMs: DAY_MS, label: "Tages" },
  weekly: { minElapsedMs: 6 * DAY_MS, windowMs: 7 * DAY_MS, label: "Wochen" },
  monthly: {
    minElapsedMs: 27 * DAY_MS,
    windowMs: 30 * DAY_MS,
    label: "Monats",
  },
};

/** What the report needs of the analytics global. */
type Settings = {
  reportInterval?: string | null;
  lastDigestAt?: string | null;
};

export type DigestOutcome = {
  status: number;
  body: Record<string, unknown>;
};

export const runStatsDigest = async (
  payload: BasePayload,
  { force = false, now = Date.now() }: { force?: boolean; now?: number } = {}
): Promise<DigestOutcome> => {
  const settings = (await payload.findGlobal({
    slug: "analytics",
    depth: 0,
    overrideAccess: true,
  })) as unknown as Settings;

  // Pruned on every call – also when no report is due or mail is off.
  let pruned = 0;
  try {
    const cutoff = new Date(now - RETENTION_MS).toISOString();
    for (const collection of ["page-views", "actions"] as const) {
      const result = await payload.delete({
        collection,
        where: { createdAt: { less_than: cutoff } },
        overrideAccess: true,
      });
      pruned += result.docs?.length ?? 0;
    }
  } catch (error) {
    console.error("[stats-digest] pruning failed:", error);
  }

  const interval =
    INTERVAL[settings.reportInterval ?? "off"] ??
    (force ? INTERVAL.weekly : null);
  if (!interval) return { status: 200, body: { skipped: "disabled", pruned } };

  const lastAt = settings.lastDigestAt
    ? new Date(settings.lastDigestAt).getTime()
    : null;
  if (!force && lastAt && now - lastAt < interval.minElapsedMs) {
    return { status: 200, body: { skipped: "not due", pruned } };
  }

  const recipient = process.env.MAIL_STATS_RECIPIENT;
  if (!recipient) {
    return {
      status: 500,
      body: { error: "No recipient configured (MAIL_STATS_RECIPIENT)" },
    };
  }

  const sinceMs = force
    ? now - interval.windowMs
    : (lastAt ?? now - interval.windowMs);
  const { subject, text, html, total, inline } = await buildDigest(payload, {
    sinceMs,
    now,
    interval,
  });

  const result = await sendMail({ to: recipient, subject, text, html, inline });
  if (!result.ok) {
    const status = result.error === "Mail not configured" ? 500 : 502;
    return { status, body: { error: result.error } };
  }

  if (!force) {
    await payload.updateGlobal({
      slug: "analytics",
      data: { lastDigestAt: new Date(now).toISOString() },
      overrideAccess: true,
    });
  }
  return { status: 200, body: { total, pruned } };
};
