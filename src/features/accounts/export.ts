import type { PayloadRequest, Where } from "payload";
// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { inviteEnd, inviteExpired } from "../calendar/invite-expiry";
import { sharedWithOf } from "../calendar/model";
import { cleanNote, noteText } from "../calendar/note";
import {
  entriesOf,
  invitedOf,
  type PushSettingsDoc,
  pushServiceOf,
  reminderAtOf,
} from "../push/rules";

/**
 * Everything Boop keeps about one account, as one JSON document – the
 * answer to “what do you have on me?” (GDPR Art. 15 and 20), downloaded
 * from the account sheet.
 *
 * It is put together field by field: what isn't named here doesn't get out
 * – no password hash, no token, no session id, no push address or key (only
 * whose push service it is), no calendar app's address (only that there is
 * one). And it is the account's own: its calendars, its stamps, the prints
 * it made, the notes it wrote last, the invitations it sent, its
 * notifications, its addresses for calendar apps. Of
 * other people only what the app shows it anyway – their names, as members
 * of its calendars and owners of the ones it is in. What they drew and
 * stamped is theirs.
 */

type Doc = Record<string, unknown>;

/** A relationship as an id, populated or not. */
const ref = (value: unknown): string => {
  if (value && typeof value === "object" && "id" in value) {
    return String(value.id);
  }
  return value == null ? "" : String(value);
};

const when = (value: unknown): string | null => {
  if (!value) return null;
  const time = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
};

const memberIds = (calendar: Doc) =>
  (Array.isArray(calendar.members) ? calendar.members : [])
    .map(ref)
    .filter(Boolean);

const alive = (doc: Doc) => !doc.deleted;

export const accountExport = ({
  account,
  calendars,
  stamps,
  placements,
  notes = [],
  invites,
  pushSettings = null,
  pushDevices = [],
  calendarFeeds = [],
  people,
  now = new Date(),
}: {
  account: Doc;
  /** The calendars it is a member of. */
  calendars: Doc[];
  stamps: Doc[];
  placements: Doc[];
  /** The days' notes it wrote last. */
  notes?: Doc[];
  invites: Doc[];
  /** What it wants to hear of (features/push) – none: all as by default. */
  pushSettings?: Doc | null;
  /** Its devices that get notifications. */
  pushDevices?: Doc[];
  /** Its addresses for calendar apps (features/ical). */
  calendarFeeds?: Doc[];
  /** The people in those calendars – names by account id. */
  people: Record<string, string>;
  now?: Date;
}) => {
  const me = String(account.id);
  const person = (id: string) => ({ id, name: people[id] ?? "" });
  const mine = calendars.filter(
    (calendar) => alive(calendar) && memberIds(calendar).includes(me)
  );
  const sessions = Array.isArray(account.sessions) ? account.sessions : [];
  return {
    exportedAt: now.toISOString(),
    account: {
      id: me,
      name: String(account.name ?? ""),
      email: String(account.email ?? ""),
      locale: String(account.locale ?? ""),
      verified: account._verified === true,
      // The two boxes only an admin ticks (collection.ts): a link to the
      // CMS in the app, and out of the daily cleanup.
      admin: account.admin === true,
      neverDelete: account.neverDelete === true,
      createdAt: when(account.createdAt),
      updatedAt: when(account.updatedAt),
      // A new address it asked for and hasn't confirmed – as it is kept,
      // with its deadline (email-change.ts). Not the link's token.
      pendingEmail: account.pendingEmail ? String(account.pendingEmail) : null,
      pendingEmailUntil: when(account.pendingEmailExpiresAt),
      // When it was last there – and warned it would go (retention.ts).
      lastSeenAt: when(account.lastSeenAt),
      deletionWarnedAt: when(account.deletionWarnedAt),
      // The devices it is logged in on – when since, until when.
      logins: sessions.map((session: Doc | null) => ({
        since: when(session?.createdAt),
        until: when(session?.expiresAt),
      })),
      // Wrong passwords lately – and, after too many, locked until when.
      failedLogins: Number(account.loginAttempts ?? 0),
      lockedUntil: when(account.lockUntil),
    },
    /** Its own calendars – and whom it shares them with. */
    calendars: mine
      .filter((calendar) => ref(calendar.owner) === me)
      .map((calendar) => ({
        id: String(calendar.id),
        name: String(calendar.name ?? ""),
        color: calendar.color ?? null,
        createdAt: when(calendar.createdAt),
        changedAt: when(calendar.changedAt),
        members: memberIds(calendar).map(person),
      })),
    /** Other people's calendars it is in. */
    memberships: mine
      .filter((calendar) => ref(calendar.owner) !== me)
      .map((calendar) => ({
        id: String(calendar.id),
        name: String(calendar.name ?? ""),
        color: calendar.color ?? null,
        owner: person(ref(calendar.owner)),
      })),
    stamps: stamps
      .filter((stamp) => alive(stamp) && ref(stamp.owner) === me)
      .map((stamp) => ({
        id: String(stamp.id),
        name: String(stamp.name ?? ""),
        color: stamp.color ?? null,
        shape: stamp.shape ?? null,
        drawing: stamp.drawing ?? null,
        /** The calendars whose members may stamp with it too. */
        sharedWith: sharedWithOf(stamp),
        createdAt: when(stamp.createdAt),
        changedAt: when(stamp.changedAt),
      })),
    /** The prints it made – in its own calendars and in others'. */
    placements: placements
      .filter((print) => alive(print) && ref(print.placedBy) === me)
      .map((print) => ({
        id: String(print.id),
        calendar: ref(print.calendar),
        date: String(print.date ?? ""),
        stamp: ref(print.stamp),
        x: print.x ?? null,
        y: print.y ?? null,
        rotation: print.rotation ?? null,
        scale: print.scale ?? null,
        z: print.z ?? null,
        ink: print.ink ?? null,
        createdAt: when(print.createdAt),
        changedAt: when(print.changedAt),
      })),
    /** The days' notes it wrote last – in its calendars and in others'. */
    notes: notes
      .filter((note) => alive(note) && ref(note.editedBy) === me)
      .map((note) => {
        const content = cleanNote(note.content);
        return {
          id: String(note.id),
          calendar: ref(note.calendar),
          date: String(note.date ?? ""),
          text: noteText(content),
          content,
          createdAt: when(note.createdAt),
          changedAt: when(note.changedAt),
        };
      }),
    /** The invitations it sent that are still open – without their link. */
    invites: invites
      .filter(
        (invite) =>
          ref(invite.invitedBy) === me && !inviteExpired(invite, now.getTime())
      )
      .map((invite) => ({
        email: String(invite.email ?? ""),
        calendar: ref(invite.calendar),
        sentAt: when(invite.createdAt),
        expiresAt: when(inviteEnd(invite)),
      })),
    /** Notifications: what it wants to hear of, and the devices that do. */
    notifications: {
      /** The evening's reminder, on each device's clock. */
      reminderAt: reminderAtOf(pushSettings as PushSettingsDoc | null),
      /** Being invited to a calendar – for the whole account. */
      invited: invitedOf(pushSettings as PushSettingsDoc | null),
      /** Calendars with a switch off – every other one has both on. */
      calendars: entriesOf(pushSettings as PushSettingsDoc | null),
      devices: pushDevices
        .filter((device) => ref(device.account) === me)
        .map((device) => ({
          /** Whose push service passes them on – Apple, Google, Mozilla … */
          service: pushServiceOf(device.endpoint),
          timeZone: String(device.timeZone ?? ""),
          locale: String(device.locale ?? ""),
          lastRemindedOn: device.remindedOn ? String(device.remindedOn) : null,
          createdAt: when(device.createdAt),
          lastUsedAt: when(device.lastUsedAt),
        })),
    },
    /**
     * The calendars it has an address for, to subscribe to in a calendar
     * app: since when, and when one last fetched it. Not the address – it
     * is a key, and the calendar's settings show it.
     */
    calendarFeeds: calendarFeeds
      .filter((feed) => ref(feed.account) === me)
      .map((feed) => ({
        calendar: ref(feed.calendar),
        createdAt: when(feed.createdAt),
        lastFetchedAt: when(feed.lastFetchedAt),
      })),
  };
};

export type AccountExport = ReturnType<typeof accountExport>;

/** Reads what the export is made of – the account's own, nothing else. */
export const collectExport = async (
  req: PayloadRequest,
  me: string
): Promise<AccountExport> => {
  const { payload } = req;
  const find = async (
    collection:
      | "calendars"
      | "stamps"
      | "placements"
      | "notes"
      | "invites"
      | "push-settings"
      | "push-subscriptions"
      | "calendar-feeds",
    where: Where
  ) =>
    (
      await payload.find({
        collection,
        where,
        depth: 0,
        pagination: false,
        overrideAccess: true,
        req,
      })
    ).docs as unknown as Doc[];
  const kept: Where = { deleted: { not_equals: true } };

  const account = (await payload.findByID({
    collection: "accounts",
    id: me,
    depth: 0,
    overrideAccess: true,
    req,
  })) as unknown as Doc;
  const calendars = await find("calendars", {
    and: [{ members: { equals: me } }, kept],
  });
  const stamps = await find("stamps", {
    and: [{ owner: { equals: me } }, kept],
  });
  const placements = await find("placements", {
    and: [{ placedBy: { equals: me } }, kept],
  });
  const notes = await find("notes", {
    and: [{ editedBy: { equals: me } }, kept],
  });
  const invites = await find("invites", { invitedBy: { equals: me } });
  const [pushSettings] = await find("push-settings", {
    account: { equals: me },
  });
  const pushDevices = await find("push-subscriptions", {
    account: { equals: me },
  });
  const calendarFeeds = await find("calendar-feeds", {
    account: { equals: me },
  });

  // The people in its calendars, by name – nothing else about them.
  const ids = [...new Set(calendars.flatMap(memberIds))];
  const { docs } = ids.length
    ? await payload.find({
        collection: "accounts",
        where: { id: { in: ids } },
        select: { name: true },
        depth: 0,
        pagination: false,
        overrideAccess: true,
        req,
      })
    : { docs: [] };
  const people = Object.fromEntries(
    docs.map((doc) => [String(doc.id), String(doc.name ?? "")])
  );

  return accountExport({
    account,
    calendars,
    stamps,
    placements,
    notes,
    invites,
    pushSettings: pushSettings ?? null,
    pushDevices,
    calendarFeeds,
    people,
  });
};

/** The file's name: boop-2026-10-12.json. */
export const exportName = (now = new Date()) =>
  `boop-${now.toISOString().slice(0, 10)}.json`;
