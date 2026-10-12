import configPromise from "@payload-config";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { denyUnlessAuthorized } from "@/features/analytics/auth";
import { expireAll } from "@/lib/cache";

/**
 * Renders every page anew on its next request (lib/cache.ts, `expireAll`).
 * Called once after each deploy (scripts/refresh-pages.sh): the image is
 * built without a database, so its pages carry the code's colors and texts
 * – without this they would stay so until “Site” or “Translations” is saved
 * in the admin.
 *
 * Only with CRON_SECRET, or by a logged-in admin – like the cron routes.
 */
export const dynamic = "force-dynamic";

export const GET = async (request: Request) => {
  const payload = await getPayload({ config: configPromise });
  const denied = await denyUnlessAuthorized(request, {
    payload,
    secret: process.env.CRON_SECRET,
  });
  if (denied) return denied;
  expireAll();
  return NextResponse.json({ refreshed: true });
};
