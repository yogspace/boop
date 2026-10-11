import configPromise from "@payload-config";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { denyUnlessAuthorized } from "@/features/analytics/auth";
import { runStatsDigest } from "@/features/analytics/report/run";

/**
 * The statistics report by mail (features/analytics/report). Called daily
 * by a cron on the server (scripts/setup-cron.sh) with CRON_SECRET, or by a
 * logged-in admin through “Send the report now” (`?force=1`). Accounts of
 * the site are never let in.
 */
export const dynamic = "force-dynamic";

export const GET = async (request: Request) => {
  const force = new URL(request.url).searchParams.get("force") === "1";
  const payload = await getPayload({ config: configPromise });

  const denied = await denyUnlessAuthorized(request, {
    payload,
    secret: process.env.CRON_SECRET,
  });
  if (denied) return denied;

  const { status, body } = await runStatsDigest(payload, { force });
  return NextResponse.json(body, { status });
};
