import type { PayloadRequest, Where } from "payload";
import { pendingEmailOf } from "@/features/accounts/retention";
import { invitationsOf } from "@/features/calendar/endpoints/invitations";
import { idOf } from "@/features/calendar/membership";
import {
  type CalendarDoc,
  type NoteDoc,
  type PlacementDoc,
  type StampDoc,
  type StampShape,
  sharedWithOf,
} from "@/features/calendar/model";
import { cleanNote } from "@/features/calendar/note";
import { DEFAULT_PALETTE, isColorKey } from "@/features/calendar/palette";
import { originOf } from "@/features/cards/rules";
import { sharedWithAny } from "./apply";
import type { Person, SyncResponse, SyncType } from "./protocol";

/**
 * Everything that changed for an account since its device's last sync –
 * see protocol.ts for the rules.
 */

/** Writes that were under way during the last sync still come along. */
const OVERLAP_MS = 10_000;

type Doc = Record<string, unknown>;

const iso = (value: unknown) =>
  value ? new Date(String(value)).toISOString() : new Date(0).toISOString();

/**
 * A color as it is stored – its key, whether the CMS has that color right
 * now or not: the device's palette decides how it shows (a key it lacks, in
 * its first color – palette.ts). One without any (there should be none)
 * goes out as the code's first.
 */
const colorOf = (doc: Doc) =>
  isColorKey(doc.color) ? doc.color : DEFAULT_PALETTE[0].key;

const toCalendar = (doc: Doc): CalendarDoc => ({
  id: String(doc.id),
  name: String(doc.name ?? ""),
  color: colorOf(doc),
  owner: idOf(doc.owner) ?? "",
  members: Array.isArray(doc.members)
    ? doc.members.map(idOf).filter((id): id is string => Boolean(id))
    : [],
  personal: Boolean(doc.personal),
  changedAt: iso(doc.changedAt),
  deleted: Boolean(doc.deleted),
});

/** A stamp – with where it came from, if it came from someone (cards). */
const toStamp = (doc: Doc): StampDoc => {
  const origin = originOf(doc.origin);
  return {
    id: String(doc.id),
    name: String(doc.name ?? ""),
    color: colorOf(doc),
    shape: (doc.shape as StampShape) ?? "circle",
    drawing: (doc.drawing as StampDoc["drawing"]) ?? null,
    owner: idOf(doc.owner) ?? "",
    sharedWith: sharedWithOf(doc),
    ...(origin && { origin }),
    changedAt: iso(doc.changedAt),
    deleted: Boolean(doc.deleted),
  };
};

const toPlacement = (doc: Doc): PlacementDoc => ({
  id: String(doc.id),
  calendar: idOf(doc.calendar) ?? "",
  date: String(doc.date ?? ""),
  stamp: idOf(doc.stamp) ?? "",
  x: Number(doc.x ?? 0.5),
  y: Number(doc.y ?? 0.5),
  rotation: Number(doc.rotation ?? 0),
  scale: Number(doc.scale ?? 1),
  z: Number(doc.z ?? 0),
  ink: isColorKey(doc.ink) ? doc.ink : null,
  placedBy: idOf(doc.placedBy) ?? "",
  changedAt: iso(doc.changedAt),
  deleted: Boolean(doc.deleted),
});

/** A note goes out checked, like it came in – a marker without its text. */
const toNote = (doc: Doc): NoteDoc => {
  const deleted = Boolean(doc.deleted);
  return {
    id: String(doc.id),
    calendar: idOf(doc.calendar) ?? "",
    date: String(doc.date ?? ""),
    content: deleted ? null : cleanNote(doc.content),
    editedBy: deleted ? "" : (idOf(doc.editedBy) ?? ""),
    changedAt: iso(doc.changedAt),
    deleted,
  };
};

export const pull = async (
  req: PayloadRequest,
  me: string,
  {
    since,
    known,
    need,
    touched,
  }: {
    since: string | null;
    known: string[];
    need: string[];
    /** Ids the device just sent – their current copy goes back. */
    touched: Record<SyncType, Set<string>>;
  }
): Promise<Omit<SyncResponse, "rejected">> => {
  // Taken before reading: whatever is written meanwhile comes next time.
  const now = new Date().toISOString();
  const sinceTime = since ? new Date(since) : null;
  const after =
    sinceTime && !Number.isNaN(sinceTime.getTime())
      ? new Date(sinceTime.getTime() - OVERLAP_MS).toISOString()
      : null;
  const changed: Where = after ? { updatedAt: { greater_than: after } } : {};

  const find = async (
    collection: "calendars" | "stamps" | "placements" | "notes",
    where: Where
  ) =>
    (
      await req.payload.find({
        collection,
        where,
        depth: 0,
        pagination: false,
        overrideAccess: true,
        req,
      })
    ).docs as unknown as Doc[];

  // All of the account's calendars, deleted ones included (as markers).
  const rows = await find("calendars", { members: { equals: me } });
  const all = rows.map(toCalendar);
  const live = all.filter((calendar) => !calendar.deleted);
  const calendarIds = live.map((calendar) => calendar.id);
  const knownIds = calendarIds.filter((id) => known.includes(id));
  const fresh = calendarIds.filter((id) => !known.includes(id));
  const alive: Where = { deleted: { not_equals: true } };

  const calendars = all.filter(
    (calendar, i) =>
      !after ||
      fresh.includes(calendar.id) ||
      touched.calendar.has(calendar.id) ||
      iso(rows[i].updatedAt) > after
  );

  const stamps = new Map<string, StampDoc>();
  const placements = new Map<string, PlacementDoc>();
  const notes = new Map<string, NoteDoc>();
  const add = <T extends { id: string }>(map: Map<string, T>, docs: T[]) => {
    for (const doc of docs) map.set(doc.id, doc);
  };

  // What changed in the calendars the device has – and the own stamps,
  // and those shared with these calendars.
  add(
    stamps,
    (
      await find("stamps", {
        and: [
          { or: [{ owner: { equals: me } }, sharedWithAny(knownIds)] },
          after ? changed : alive,
        ],
      })
    ).map(toStamp)
  );
  if (knownIds.length) {
    add(
      placements,
      (
        await find("placements", {
          and: [{ calendar: { in: knownIds } }, after ? changed : alive],
        })
      ).map(toPlacement)
    );
    add(
      notes,
      (
        await find("notes", {
          and: [{ calendar: { in: knownIds } }, after ? changed : alive],
        })
      ).map(toNote)
    );
  }
  // The calendars new to the device – complete, without markers.
  if (fresh.length) {
    add(
      stamps,
      (await find("stamps", { and: [sharedWithAny(fresh), alive] })).map(
        toStamp
      )
    );
    add(
      placements,
      (
        await find("placements", {
          and: [{ calendar: { in: fresh } }, alive],
        })
      ).map(toPlacement)
    );
    add(
      notes,
      (await find("notes", { and: [{ calendar: { in: fresh } }, alive] })).map(
        toNote
      )
    );
  }

  // The current copy of what the device just sent – if it may see it.
  const mine = new Set(calendarIds);
  if (touched.stamp.size) {
    add(
      stamps,
      (await find("stamps", { id: { in: [...touched.stamp] } }))
        .map(toStamp)
        .filter(
          (stamp) =>
            stamp.owner === me || stamp.sharedWith.some((id) => mine.has(id))
        )
    );
  }
  if (touched.placement.size) {
    add(
      placements,
      (await find("placements", { id: { in: [...touched.placement] } }))
        .map(toPlacement)
        .filter((placement) => mine.has(placement.calendar))
    );
  }
  if (touched.note.size) {
    add(
      notes,
      (await find("notes", { id: { in: [...touched.note] } }))
        .map(toNote)
        .filter((note) => mine.has(note.calendar))
    );
  }

  // Stamps others placed in shared calendars: asked for by the device, or
  // used by a calendar that is new to it.
  const missing = new Set(need);
  for (const placement of placements.values()) {
    if (!stamps.has(placement.stamp)) missing.add(placement.stamp);
  }
  if (missing.size && calendarIds.length) {
    // Only stamps that are placed in one of the account's calendars.
    const used = await find("placements", {
      and: [
        { stamp: { in: [...missing] } },
        { calendar: { in: calendarIds } },
        alive,
      ],
    });
    const visible = [...new Set(used.map((doc) => idOf(doc.stamp)))].filter(
      (id): id is string => Boolean(id)
    );
    if (visible.length) {
      add(stamps, (await find("stamps", { id: { in: visible } })).map(toStamp));
    }
  }

  // All that others share with the account – a stamp no longer among them
  // has changed, but no device of the account would hear of it above.
  const shared = calendarIds.length
    ? (
        await req.payload.find({
          collection: "stamps",
          where: {
            and: [
              sharedWithAny(calendarIds),
              { owner: { not_equals: me } },
              alive,
            ],
          },
          select: { owner: true },
          depth: 0,
          pagination: false,
          overrideAccess: true,
          req,
        })
      ).docs.map((doc) => String(doc.id))
    : [];

  // The people in those calendars, by name – nothing else about them.
  const memberIds = [...new Set(live.flatMap((calendar) => calendar.members))];
  const accounts = memberIds.length
    ? (
        await req.payload.find({
          collection: "accounts",
          where: { id: { in: [...new Set([...memberIds, me])] } },
          select: {
            name: true,
            email: true,
            locale: true,
            pendingEmail: true,
            pendingEmailExpiresAt: true,
            admin: true,
          },
          depth: 0,
          pagination: false,
          overrideAccess: true,
          req,
        })
      ).docs
    : [];
  const self = (accounts.find((doc) => String(doc.id) === me) ??
    (await req.payload.findByID({
      collection: "accounts",
      id: me,
      depth: 0,
      overrideAccess: true,
      req,
    }))) as Doc;
  const people: Person[] = accounts.map((doc) => ({
    id: String(doc.id),
    name: String((doc as Doc).name ?? ""),
  }));
  // Invitations to the account's own address – the one it logs in with,
  // confirmed (a new one waiting for its link is none of its yet).
  const invitations = await invitationsOf(req, { id: me, email: self.email });

  return {
    now,
    me: {
      id: me,
      name: String(self.name ?? ""),
      email: String(self.email ?? ""),
      locale: String(self.locale ?? "de"),
      // A new address it asked for and hasn't confirmed yet (accounts/
      // email-change.ts) – the account sheet says so.
      pendingEmail: pendingEmailOf(self),
      // Its own box only – what an admin ticked for it, to show a link to
      // the CMS. Nobody else's goes out.
      admin: self.admin === true,
    },
    calendarIds,
    people,
    calendars,
    // Someone else's stamp names only the calendars this account is in –
    // and of where it came from, no more than whether (cards/rules.ts).
    stamps: [...stamps.values()].map((stamp) => {
      if (stamp.owner === me) return stamp;
      const { origin, ...theirs } = stamp;
      const told = originOf(origin, false);
      return {
        ...theirs,
        sharedWith: stamp.sharedWith.filter((id) => mine.has(id)),
        ...(told && { origin: told }),
      };
    }),
    shared,
    placements: [...placements.values()],
    notes: [...notes.values()],
    invitations,
  };
};
