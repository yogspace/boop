import configPromise from "@payload-config";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { denyUnlessAuthorized } from "@/features/analytics/auth";
import { runReminders } from "@/features/push/reminder";

/**
 * The evening's reminder (features/push/reminder.ts): every device whose
 * time has come on its clock hears which calendars still wait for a print
 * today – once a day. Answers with the counts, nothing else.
 *
 * `?dry=1` only counts what it would do – nothing is sent, noted or
 * deleted.
 *
 * Called every 15 minutes by a cron on the server (scripts/setup-cron.sh)
 * with CRON_SECRET, or by a logged-in admin – like the cleanup
 * (../cleanup). Accounts of the site are never let in.
 */
export const dynamic = "force-dynamic";

export const GET = async (request: Request) => {
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const payload = await getPayload({ config: configPromise });

  const denied = await denyUnlessAuthorized(request, {
    payload,
    secret: process.env.CRON_SECRET,
  });
  if (denied) return denied;

  return NextResponse.json(await runReminders(payload, { dry }));
};
