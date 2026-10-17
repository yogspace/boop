import type { SyncRequest, SyncResponse } from "@/features/sync/protocol";
import { MAX_CHANGES } from "@/features/sync/protocol";
import { write } from "../db";
import { waiting } from "./changes";
import { type Local, set } from "./local";
import { merge } from "./merge";

/**
 * The sync: the outbox to the server in parts, and what changed elsewhere
 * back (store/merge.ts) – soon after a change, and whenever the app asks.
 * One at a time; asked for meanwhile, another follows.
 */

/** Soon after a change – several quick changes go together. */
export const scheduleSync = (local: Local, delay = 700) => {
  clearTimeout(local.timer);
  local.timer = setTimeout(() => void sync(local), delay);
};

/** Sends the outbox and takes over what changed – unless offline. */
export const sync = async (local: Local): Promise<void> => {
  if (local.running) {
    local.again = true;
    return local.running;
  }
  if (!(local.boop.me && navigator.onLine)) return;
  local.running = (async () => {
    set(local, { syncing: true });
    try {
      // A few rounds at most: the outbox in parts, then missing stamps –
      // and a calendar the server names but this device doesn't have.
      for (let round = 0; round < 5; round++) {
        const batch = local.outbox.slice(0, MAX_CHANGES);
        for (const entry of batch) local.inFlight.add(entry.seq);
        const need = missingStamps(local);
        const body: SyncRequest = {
          since: local.since,
          // Only those really here: the server sends the others complete,
          // as it does new ones – so one this device lost comes back.
          known: local.known.filter((id) => here(local, id)),
          need,
          changes: batch.map((entry) => entry.change),
        };
        const response = await fetch("/api/sync", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (response.status === 401) {
          // The login expired – the data stays until someone logs in.
          set(local, { status: "signedOut" });
          return;
        }
        if (!response.ok) throw new Error(`Sync failed: ${response.status}`);
        const result = (await response.json()) as SyncResponse;
        const sent = new Set(batch.map((entry) => entry.seq));
        local.outbox = local.outbox.filter((entry) => !sent.has(entry.seq));
        local.inFlight.clear();
        await write(
          batch.map((entry) => ({ store: "outbox", delete: entry.seq }))
        );
        await merge(local, result);
        const stillMissing = missingStamps(local);
        const progress = need.some((id) => !stillMissing.includes(id));
        const lost = result.calendarIds.some((id) => !here(local, id));
        if (lost) continue;
        if (!local.outbox.length && (!stillMissing.length || !progress)) break;
      }
    } catch {
      // Offline or the server is away – the outbox waits for the next try.
    } finally {
      local.inFlight.clear();
      set(local, { syncing: false });
    }
  })();
  await local.running;
  local.running = null;
  if (local.again) {
    local.again = false;
    void sync(local);
  }
};

/** Stamps the device's placements use but it doesn't have. */
const missingStamps = ({ boop }: Local) => [
  ...new Set(
    Object.values(boop.placements)
      .map((p) => p.stamp)
      .filter((id) => !boop.stamps[id])
  ),
];

/**
 * Is this calendar on the device? Also one changed here and not yet sent –
 * deleted here, it is on its way out, not lost.
 */
const here = (local: Local, id: string) =>
  Boolean(local.boop.calendars[id]) || waiting(local, "calendar", id);
