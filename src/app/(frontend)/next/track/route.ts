import { NextResponse } from "next/server";
import { cleanPath, counting, readBody } from "@/features/analytics/count";
import {
  browserLabel,
  deviceClass,
  osLabel,
  sourceOf,
} from "@/features/analytics/device-class";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Anonymous page-view beacon (features/analytics/client.ts). Stores ONLY
 * coarse dimensions – page, source group, device class, system, browser – no
 * IP, no identifier (see features/analytics/collections/page-views.ts).
 */
export const dynamic = "force-dynamic";

const ok = () => new NextResponse(null, { status: 204 });

// More than anyone clicks in a minute – so nobody can fill the statistics.
// Beyond it the beacon is answered as usual, just not counted.
const tooMany = rateLimit({ limit: 60, windowMs: 60 * 1000 });

export const POST = async (request: Request) => {
  if (tooMany(clientIp(request))) return ok();

  const body = await readBody(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const path = cleanPath(body.path);
  if (!path) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const payload = await counting(request, body.exclude);
  if (!payload) return ok();

  const agent = request.headers.get("user-agent") ?? "";
  const ownHost = (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    ""
  )
    .split(":")[0]
    .replace(/^www\./, "");

  try {
    await payload.create({
      collection: "page-views",
      overrideAccess: true,
      data: {
        path,
        referrer: sourceOf(
          typeof body.ref === "string" ? body.ref : undefined,
          ownHost
        ),
        device: deviceClass(agent),
        os: osLabel(agent),
        browser: browserLabel(agent),
      },
    });
  } catch (error) {
    // Statistics never break the page – report success regardless.
    console.error("[track] could not record the view:", error);
  }
  return ok();
};
