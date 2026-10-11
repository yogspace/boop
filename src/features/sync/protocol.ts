import type {
  CalendarDoc,
  PlacementDoc,
  StampDoc,
} from "@/features/calendar/model";

/**
 * How a device and the server agree – one request, POST /api/sync:
 *
 * 1. The device sends what changed on it since its last sync (`changes`,
 *    oldest first) – made offline or just now.
 * 2. The server applies each one the account may make, unless the server's
 *    copy was changed later (the later change wins, by `changedAt`), and
 *    answers with everything that changed for this account since `since`,
 *    plus the current copy of every document the device sent.
 * 3. The device takes that over and remembers `now` for next time.
 *
 * Calendars the device doesn't know yet (`known`) come complete, whatever
 * `since` says – a calendar shared with someone brings its whole past.
 * Stamps placed by others but missing on the device are asked for by id
 * (`need`). Whatever is gone from `calendarIds` (deleted, or no longer a
 * member) the device drops, with all that is in it.
 */

export const SYNC_TYPES = ["calendar", "stamp", "placement"] as const;
export type SyncType = (typeof SYNC_TYPES)[number];

/** One change made on a device. `data` holds the fields that changed. */
export type Change = {
  type: SyncType;
  id: string;
  /** When it was made, on the device (ISO). */
  changedAt: string;
  deleted?: boolean;
  data?: Record<string, unknown>;
};

export type SyncRequest = {
  /** `now` of the last sync – null on the first. */
  since: string | null;
  /** Calendars this device already has complete. */
  known: string[];
  /** Stamp ids the device's placements use but it doesn't have. */
  need: string[];
  changes: Change[];
};

export type Person = { id: string; name: string };

export type SyncResponse = {
  /** Send it as `since` next time. */
  now: string;
  me: Person & { email: string; locale: string };
  /** All calendars the account belongs to – anything else goes. */
  calendarIds: string[];
  /** The members of those calendars, by name. */
  people: Person[];
  calendars: CalendarDoc[];
  stamps: StampDoc[];
  placements: PlacementDoc[];
  /** Changes the server refused – the device takes the server's copy. */
  rejected: { type: SyncType; id: string; reason: string }[];
};

/** At most this many changes per request – a device sends the rest next. */
export const MAX_CHANGES = 200;
