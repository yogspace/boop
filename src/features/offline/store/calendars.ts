import type { CalendarDoc, ColorName } from "@/features/calendar/model";
import { newId } from "@/lib/id";
import { type Op, write } from "../db";
import { enqueue, keep, me, now, plain } from "./changes";
import type { Local } from "./local";
import { tidyPrefs } from "./prefs";
import { tidyStamps } from "./stamps";

/**
 * The calendars: made, renamed, deleted – and one going off this device
 * with all that is in it, deleted here or no longer the account's
 * (store/merge.ts).
 */

export const createCalendar = async (
  local: Local,
  name: string,
  color: ColorName
) => {
  const doc: CalendarDoc = {
    id: newId(),
    name,
    color,
    owner: me(local),
    members: [me(local)],
    personal: false,
    changedAt: now(),
    deleted: false,
  };
  await keep(local, "calendar", doc);
  await enqueue(local, {
    type: "calendar",
    id: doc.id,
    changedAt: doc.changedAt,
    data: { name, color },
  });
  return doc.id;
};

export const renameCalendar = async (
  local: Local,
  id: string,
  name: string,
  color?: ColorName
) => {
  const doc = local.boop.calendars[id];
  if (!doc) return;
  const changedAt = now();
  await keep(local, "calendar", {
    ...plain(doc),
    name,
    ...(color && { color }),
    changedAt,
  });
  await enqueue(local, {
    type: "calendar",
    id,
    changedAt,
    data: { name, ...(color && { color }) },
  });
};

export const deleteCalendar = async (local: Local, id: string) => {
  const doc = local.boop.calendars[id];
  if (!doc) return;
  const changedAt = now();
  await dropCalendar(local, id);
  await enqueue(local, { type: "calendar", id, changedAt, deleted: true });
};

/**
 * A calendar off this device – with its placements and notes. The stamps
 * follow (`tidyStamps`): mine all stay. So do the own settings for it.
 */
const dropCalendar = async (local: Local, id: string) => {
  const { calendars } = local.boop;
  delete calendars[id];
  const ops: Op[] = [
    { store: "calendars", delete: id },
    ...dropContents(local, id),
  ];
  await write([...ops, ...tidyStamps(local), ...tidyPrefs(local)]);
};

/** What is in a calendar – its placements and notes – off this device. */
export const dropContents = (local: Local, calendar: string): Op[] => {
  const { placements, notes } = local.boop;
  const ops: Op[] = [];
  for (const p of Object.values(placements)) {
    if (p.calendar === calendar) {
      delete placements[p.id];
      ops.push({ store: "placements", delete: p.id });
    }
  }
  for (const note of Object.values(notes)) {
    if (note.calendar === calendar) {
      delete notes[note.id];
      ops.push({ store: "notes", delete: note.id });
    }
  }
  return ops;
};
