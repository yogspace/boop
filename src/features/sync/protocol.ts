import type {
  CalendarDoc,
  ColorName,
  NoteDoc,
  PlacementDoc,
  StampDoc,
} from "@/features/calendar/model";

/**
 * How a device and the server agree – one request, POST /api/sync:
 *
 * 1. The device sends what changed on it since its last sync (`changes`,
 *    oldest first) – made offline or just now.
 * 2. The server applies each one the account may make (new calendars
 *    first – the rest may refer to them), unless the server's copy was
 *    changed later (the later change wins, by `changedAt`), and
 *    answers with everything that changed for this account since `since`,
 *    plus the current copy of every document the device sent.
 * 3. The device takes that over and remembers `now` for next time.
 *
 * Calendars the device doesn't know yet (`known`) come complete, whatever
 * `since` says – a calendar shared with someone brings its whole past.
 * Whatever is gone from `calendarIds` (deleted, or no longer a member) the
 * device drops, with all that is in it.
 *
 * Stamps are their owners': an account gets its own, and those shared with
 * a calendar it is in (`sharedWith`) – to stamp with in every calendar of
 * its own. One it had and that is gone from `shared` is no longer shared
 * with it. Stamps others merely placed in a calendar come too, so their
 * prints show: with the calendar, or asked for by id (`need`) – those are
 * not to stamp with.
 *
 * Notes come with their calendars, like placements. A day's note has the
 * same id on every device (calendar/note.ts): written on two at once, it is
 * still one note – the later change wins, the earlier is gone. That is the
 * price of keeping it simple; a day's few lines rarely meet that way. An
 * emptied note is deleted – and may be written again, unlike anything else.
 *
 * Invitations to the account (`invitations`) come along whole, every time:
 * the open ones to its confirmed address, as the app shows them – to take
 * up or turn down through their own endpoints (calendar/endpoints/
 * invitations.ts). A server from before sends none; the app then keeps
 * what it has.
 *
 * An app from before (it stays cached on a phone for a while) still sends a
 * stamp's `calendar` (one, or null) instead of `sharedWith` – taken as
 * that; see apply.ts. It knows nothing of notes: it sends none, and leaves
 * `notes` aside.
 */

export const SYNC_TYPES = ["calendar", "stamp", "placement", "note"] as const;
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

/**
 * An invitation to the account, as far as the app sees it: the calendar's
 * name and color, who invites by name, until when. Nothing else of the
 * calendar before the yes – and never the invitation's token or anyone's
 * address.
 */
export type InvitationDoc = {
  id: string;
  /** The calendar's name. */
  calendar: string;
  color: ColorName;
  /** Who invites, by name – "" for an account that is gone. */
  from: string;
  /** Until when it can be taken up (ISO). */
  expiresAt: string;
};

export type SyncResponse = {
  /** Send it as `since` next time. */
  now: string;
  /**
   * `pendingEmail`: a new address waiting for its confirmation, if any.
   * `admin`: the app shows a link to the CMS – no right (accounts/
   * collection.ts).
   */
  me: Person & {
    email: string;
    locale: string;
    pendingEmail?: string | null;
    admin?: boolean;
  };
  /** All calendars the account belongs to – anything else goes. */
  calendarIds: string[];
  /** The members of those calendars, by name. */
  people: Person[];
  calendars: CalendarDoc[];
  stamps: StampDoc[];
  /** All stamps of others shared with the account – by id. */
  shared: string[];
  placements: PlacementDoc[];
  notes: NoteDoc[];
  /** The open invitations to the account, oldest first – all of them. */
  invitations?: InvitationDoc[];
  /** Changes the server refused – the device takes the server's copy. */
  rejected: { type: SyncType; id: string; reason: string }[];
};

/** At most this many changes per request – a device sends the rest next. */
export const MAX_CHANGES = 200;
