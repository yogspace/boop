import { proxy } from "valtio";
import type { Me } from "@/features/accounts/client";
import type {
  CalendarDoc,
  NoteDoc,
  PlacementDoc,
  StampDoc,
} from "@/features/calendar/model";
import type { CalendarPrefs } from "@/features/calendar/prefs";
import type { Change, InvitationDoc, SyncType } from "@/features/sync/protocol";

/**
 * The store as its parts share it – one per page, made by store.ts: the
 * data the app shows (`boop`, a valtio proxy) and what the store keeps to
 * itself – the outbox, where the sync left off, what is under way. Every
 * part's function is handed it; none keeps anything of its own.
 */

export type Docs<T> = Record<string, T>;

export type OutboxEntry = { seq: number; change: Change };

export type BoopState = {
  status: "loading" | "ready" | "signedOut" | "offlineNoAccount";
  me: Me | null;
  online: boolean;
  syncing: boolean;
  /** Changes not yet on the server. */
  pending: number;
  calendars: Docs<CalendarDoc>;
  stamps: Docs<StampDoc>;
  placements: Docs<PlacementDoc>;
  /** The days' notes, by id (`noteId` – of calendar and day). */
  notes: Docs<NoteDoc>;
  /** Names of the people in the account's calendars, by id. */
  people: Record<string, string>;
  /**
   * The account's own settings per calendar, by its id – read with `prefOf`
   * and `colorOf`, never directly (store/prefs.ts).
   */
  prefs: Docs<CalendarPrefs>;
  /** Open invitations to the account, oldest first (store/invitations.ts). */
  invitations: InvitationDoc[];
};

/**
 * Where each kind is kept on the device. One's own settings are kept apart,
 * by calendar (store/prefs.ts).
 */
export const KIND = {
  calendar: "calendars",
  stamp: "stamps",
  placement: "placements",
  note: "notes",
} as const satisfies Record<Exclude<SyncType, "pref">, string>;

export type Kind = keyof typeof KIND;

export type Local = {
  /** What the app shows – `boop` and `useBoop()` in store.ts. */
  boop: BoopState;
  /** Changes not yet on the server, oldest first (store/changes.ts). */
  outbox: OutboxEntry[];
  /** Sequence numbers of the entries on their way to the server right now. */
  inFlight: Set<number>;
  nextSeq: number;
  /** Where the last sync left off, and the calendars it named. */
  since: string | null;
  known: string[];
  /**
   * Invitations answered here – kept out of what a sync asked for before
   * the answer may still bring, until one comes without them.
   */
  answered: Set<string>;
  /** Opened once (`start`, store/session.ts) – and the live line. */
  started: boolean;
  source: EventSource | null;
  /** The sync soon to come, the one under way – and one more after it. */
  timer: ReturnType<typeof setTimeout> | undefined;
  running: Promise<void> | null;
  again: boolean;
};

/** A store as it starts out – nothing on it yet until `start`. */
export const newLocal = (): Local => ({
  boop: proxy<BoopState>({
    status: "loading",
    me: null,
    online: true,
    syncing: false,
    pending: 0,
    calendars: {},
    stamps: {},
    placements: {},
    notes: {},
    people: {},
    prefs: {},
    invitations: [],
  }),
  outbox: [],
  inFlight: new Set(),
  nextSeq: 0,
  since: null,
  known: [],
  answered: new Set(),
  started: false,
  source: null,
  timer: undefined,
  running: null,
  again: false,
});

/** Changes what the app shows – and with it the count still to send. */
export const set = (local: Local, patch: Partial<BoopState>) => {
  Object.assign(local.boop, patch);
  local.boop.pending = local.outbox.length;
};
