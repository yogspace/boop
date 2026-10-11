import configPromise from "@payload-config";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { readBody } from "@/features/analytics/count";
import {
  isExcludedToken,
  newExcludeToken,
  readExcludeToken,
  writeExcludeToken,
} from "@/features/analytics/exclude";
import { isAdminRequest } from "@/features/analytics/auth";

/**
 * One's own devices out of the statistics (features/analytics/exclude.ts) –
 * admins only: who may hand out or renew the token decides whose visits
 * disappear. The device keeps the token itself (local storage); this route
 * only checks and hands it out.
 *
 *   POST { action: "status", token }  → { excluded, hasToken } – is the
 *                                        device's token the valid one?
 *   POST { action: "exclude" }        → { token }: the current token (created
 *                                        if there is none yet)
 *   POST { action: "rotate" }         → { token }: a new token – every other
 *                                        device counts again
 *
 * “Count this device again” needs no server: the device drops its token.
 */
export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  const payload = await getPayload({ config: configPromise });
  if (!(await isAdminRequest(payload, request.headers))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readBody(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body.action === "status") {
    return NextResponse.json({
      excluded: await isExcludedToken(payload, body.token),
      hasToken: Boolean(await readExcludeToken(payload)),
    });
  }
  if (body.action === "exclude" || body.action === "rotate") {
    let token =
      body.action === "exclude" ? await readExcludeToken(payload) : null;
    if (!token) {
      token = newExcludeToken();
      await writeExcludeToken(payload, token);
    }
    return NextResponse.json({ token });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
};
