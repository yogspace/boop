import type { Endpoint } from "payload";
import { accountOf } from "@/access";
import { calendarsOf } from "@/features/calendar/membership";
import { isId } from "@/lib/id";
import { rateLimit } from "@/lib/rate-limit";
import { type ApplyContext, applyChange } from "./apply";
import {
  type Change,
  MAX_CHANGES,
  SYNC_TYPES,
  type SyncResponse,
  type SyncType,
} from "./protocol";
import { pull } from "./pull";

/**
 * POST /api/sync – the app's only way to read and write calendars, stamps
 * and placements (protocol.ts). Logged-in accounts only; what each may do is
 * checked per change in apply.ts.
 */

// A device syncs on changes, when it comes back online and now and then –
// far below this.
const tooMany = rateLimit({ limit: 120, windowMs: 60 * 1000 });

const ids = (value: unknown, max = 1000): string[] =>
  Array.isArray(value) ? value.filter(isId).slice(0, max) : [];

const isChange = (value: unknown): value is Change => {
  if (!value || typeof value !== "object") return false;
  const change = value as Partial<Change>;
  return (
    SYNC_TYPES.includes(change.type as SyncType) &&
    isId(change.id) &&
    typeof change.changedAt === "string" &&
    (change.data === undefined ||
      (typeof change.data === "object" && change.data !== null))
  );
};

export const syncEndpoint: Endpoint = {
  path: "/sync",
  method: "post",
  handler: async (req) => {
    const account = accountOf(req);
    if (!account) {
      return Response.json({ error: "Not logged in." }, { status: 401 });
    }
    const me = String(account.id);
    if (tooMany(me)) {
      return Response.json({ error: "Too many syncs." }, { status: 429 });
    }

    const body = (await req.json?.().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) return Response.json({ error: "No body." }, { status: 400 });
    const changes = Array.isArray(body.changes) ? body.changes : [];
    if (changes.length > MAX_CHANGES) {
      return Response.json({ error: "Too many changes." }, { status: 413 });
    }

    const ctx: ApplyContext = {
      req,
      me,
      mine: new Set((await calendarsOf(req, me)).map((c) => c.id)),
    };
    const touched: Record<SyncType, Set<string>> = {
      calendar: new Set(),
      stamp: new Set(),
      placement: new Set(),
    };
    const rejected: SyncResponse["rejected"] = [];

    for (const change of changes) {
      if (!isChange(change)) {
        const { type, id } = (change ?? {}) as Partial<Change>;
        if (SYNC_TYPES.includes(type as SyncType) && typeof id === "string") {
          rejected.push({ type: type as SyncType, id, reason: "malformed" });
        }
        continue;
      }
      touched[change.type].add(change.id);
      try {
        const outcome = await applyChange(ctx, change);
        if (!outcome.ok) {
          rejected.push({
            type: change.type,
            id: change.id,
            reason: outcome.reason,
          });
        }
      } catch (error) {
        req.payload.logger.warn({ err: error, msg: "[sync] change failed" });
        rejected.push({ type: change.type, id: change.id, reason: "invalid" });
      }
    }

    const result = await pull(req, me, {
      since: typeof body.since === "string" ? body.since : null,
      known: ids(body.known),
      need: ids(body.need),
      touched,
    });
    return Response.json({ ...result, rejected } satisfies SyncResponse);
  },
};
