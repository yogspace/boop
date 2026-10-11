import type { Endpoint } from "payload";
import { isAdmin } from "@/access";
import { isSeedKey, type SeedResponse, seedCanReplace } from "./definitions";
import { runSeed } from "./run";

/**
 * POST /api/seeds/:key – a seed from the admin's Seeds page, in Payload
 * itself. Admins only: a seed writes with full access, and the accounts are
 * logged-in Payload users too. `?mode=replace` replaces where the seed
 * allows it; anything else fills.
 */
export const seedEndpoint: Endpoint = {
  path: "/seeds/:key",
  method: "post",
  handler: async (req) => {
    const respond = (body: SeedResponse, status = 200) =>
      Response.json(body, { status });

    if (!isAdmin(req)) {
      return respond({ error: "Admins only – please log in." }, 401);
    }

    const key = req.routeParams?.key;
    if (!isSeedKey(key)) return respond({ error: "Unknown seed." }, 404);

    const replace =
      seedCanReplace[key] && req.searchParams.get("mode") === "replace";

    try {
      const summary = await runSeed(key, req.payload, replace);
      req.payload.logger.info(`[seed:${key}] ${summary}`);
      return respond({ summary });
    } catch (error) {
      req.payload.logger.error({ err: error, msg: `[seed:${key}] failed` });
      return respond(
        { error: error instanceof Error ? error.message : "Seed failed." },
        500
      );
    }
  },
};
