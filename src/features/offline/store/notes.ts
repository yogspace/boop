import type { DayKey, NoteContent, NoteDoc } from "@/features/calendar/model";
import { cleanNote, noteId, sameNote } from "@/features/calendar/note";
import { enqueue, keep, me, now, plain } from "./changes";
import type { Local } from "./local";

/**
 * A day's note, as it is now – written by any member of its calendar.
 * Nothing left once checked (`cleanNote`) and it is deleted; the same as
 * before, and nothing happens. It is the day's (`noteId`): the same day on
 * another device is the same note, and whoever writes last has it.
 */
export const setNote = async (
  local: Local,
  calendar: string,
  date: DayKey,
  content: NoteContent | null
) => {
  if (!local.boop.calendars[calendar]) return;
  const id = noteId(calendar, date);
  const clean = cleanNote(content);
  if (sameNote(local.boop.notes[id]?.content, clean)) return;
  const changedAt = now();
  await keep(local, "note", {
    id,
    calendar,
    date,
    content: clean,
    editedBy: clean ? me(local) : "",
    changedAt,
    deleted: !clean,
  } satisfies NoteDoc);
  await enqueue(local, {
    type: "note",
    id,
    changedAt,
    deleted: !clean,
    data: clean ? { calendar, date, content: plain(clean) } : undefined,
  });
};
