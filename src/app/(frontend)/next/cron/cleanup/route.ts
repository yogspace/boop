import configPromise from "@payload-config";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { runCleanup } from "@/features/accounts/cleanup";
import { denyUnlessAuthorized } from "@/features/analytics/auth";

/**
 * The daily tidy-up (features/accounts/cleanup.ts): invitations that are
 * over, sign-ups never confirmed, accounts long unused – warned by mail, or
 * deleted a month after. Answers with the counts, as it logs them.
 *
 * `?dry=1` only counts what it would do – nothing is written, sent or
 * deleted. Worth a look before the first real run.
 *
 * Called daily by a cron on the server (scripts/setup-cron.sh) with
 * CRON_SECRET, or by a logged-in admin – like the statistics report
 * (../stats-digest). Accounts of the site are never let in.
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

  return NextResponse.json(await runCleanup(payload, { dry }));
};
