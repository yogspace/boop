import type { Endpoint, PayloadRequest } from "payload";
import { sessionAccount } from "@/features/accounts/session";

/**
 * Live nudges: every open app holds GET /api/sync/live (Server-Sent Events).
 * When something changes in a calendar, each member's devices get a
 * “change” – and sync at once, instead of at the next round. The nudge
 * carries nothing; the data still comes only through the sync.
 *
 * Kept in memory: Boop runs as one server process. (With several, this would
 * go through a shared channel.)
 */

type Send = (event: string) => void;

const devices = new Map<string, Set<Send>>();

/** Nudges every open device of these accounts. */
export const nudge = (accounts: Iterable<string>) => {
  for (const account of new Set(accounts)) {
    for (const send of devices.get(account) ?? []) send("change");
  }
};

/** Nudges everyone in these calendars. */
export const nudgeCalendars = async (
  req: PayloadRequest,
  calendars: Iterable<string>
) => {
  const ids = [...new Set(calendars)];
  if (!ids.length) return;
  const { docs } = await req.payload.find({
    collection: "calendars",
    where: { id: { in: ids } },
    select: { members: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  nudge(
    docs.flatMap((doc) =>
      ((doc as { members?: unknown[] }).members ?? []).map((m) =>
        typeof m === "object" && m
          ? String((m as { id: unknown }).id)
          : String(m)
      )
    )
  );
};

/** Proxies drop quiet connections – a comment now and then keeps it open. */
const PING_MS = 25_000;

export const liveEndpoint: Endpoint = {
  path: "/sync/live",
  method: "get",
  handler: async (req) => {
    const account = await sessionAccount(req);
    if (!account) {
      return Response.json({ error: "Not logged in." }, { status: 401 });
    }
    const id = String(account.id);
    const encoder = new TextEncoder();
    let stop = () => {};
    const stream = new ReadableStream({
      start(controller) {
        const write = (text: string) => {
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            stop();
          }
        };
        const send: Send = (event) => write(`event: ${event}\ndata: {}\n\n`);
        const set = devices.get(id) ?? new Set<Send>();
        set.add(send);
        devices.set(id, set);
        write(": hello\n\n");
        const ping = setInterval(() => write(": ping\n\n"), PING_MS);
        stop = () => {
          clearInterval(ping);
          set.delete(send);
          if (!set.size) devices.delete(id);
        };
      },
      cancel() {
        stop();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  },
};
