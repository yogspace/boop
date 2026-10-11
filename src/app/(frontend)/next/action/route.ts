import { NextResponse } from "next/server";
import { isActionName } from "@/features/analytics/actions";
import { cleanPath, counting, readBody } from "@/features/analytics/count";
import { deviceClass } from "@/features/analytics/device-class";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Anonymous action beacon (features/analytics/client.ts): which action, on
 * which page, the device class – nothing else. Unknown names are refused.
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
  const { name } = body;
  if (!isActionName(name)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const payload = await counting(request, body.exclude);
  if (!payload) return ok();

  try {
    await payload.create({
      collection: "actions",
      overrideAccess: true,
      data: {
        name,
        path: cleanPath(body.path),
        device: deviceClass(request.headers.get("user-agent") ?? ""),
      },
    });
  } catch (error) {
    console.error("[action] could not record the action:", error);
  }
  return ok();
};
