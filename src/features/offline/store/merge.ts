import { stampDoc } from "@/features/calendar/model";
import { cleanNote } from "@/features/calendar/note";
import type { SyncResponse } from "@/features/sync/protocol";
import { clearAll, type Op, write } from "../db";
import { dropContents } from "./calendars";
import { plain, waiting } from "./changes";
import { INVITATIONS, openInvitations } from "./invitations";
import { type Docs, KIND, type Kind, type Local, set } from "./local";
import { takePrefs, tidyPrefs } from "./prefs";
import { tidyStamps } from "./stamps";

/**
 * What a sync brought (store/sync.ts), taken over – unless this device
 * changed it since: the documents, what the server refused, the calendars
 * the account no longer has, its people and invitations.
 */
export const merge = async (local: Local, result: SyncResponse) => {
  const { boop } = local;
  // Another account answered than the one on this device (logged in
  // elsewhere in this browser): start over with its data.
  if (boop.me && result.me.id !== boop.me.id) {
    await clearAll();
    window.location.reload();
    return;
  }
  const ops: Op[] = [];
  const { calendars, stamps, placements, notes } = boop;

  const take = <T extends { id: string; deleted: boolean }>(
    type: Kind,
    docs: Docs<T>,
    incoming: T[]
  ) => {
    for (const doc of incoming) {
      if (waiting(local, type, doc.id)) continue;
      if (doc.deleted) {
        delete docs[doc.id];
        ops.push({ store: KIND[type], delete: doc.id });
      } else {
        docs[doc.id] = doc;
        ops.push({ store: KIND[type], put: plain(doc) });
      }
    }
  };
  take("calendar", calendars, result.calendars);
  take("stamp", stamps, result.stamps.map(stampDoc));
  take("placement", placements, result.placements);
  // A note is checked again before it is kept – nothing left of it, and it
  // is gone. (A server from before sends none.)
  const incoming = (result.notes ?? []).map((note) => {
    const content = note.deleted ? null : cleanNote(note.content);
    return { ...note, content, deleted: !content };
  });
  take("note", notes, incoming);
  // The account's own settings for its calendars. (A server from before
  // sends none.)
  ops.push(...takePrefs(local, result.prefs ?? []));

  // Refused and not sent back: it never made it to the server – it goes.
  const returned = new Set(
    [
      ...result.calendars,
      ...result.stamps,
      ...result.placements,
      ...incoming,
    ].map((doc) => doc.id)
  );
  for (const { type, id } of result.rejected) {
    // One's own settings stay as they are here: the server's copy, if it
    // has one, came above.
    if (type === "pref" || returned.has(id) || waiting(local, type, id)) {
      continue;
    }
    const docs = {
      calendar: calendars,
      stamp: stamps,
      placement: placements,
      note: notes,
    }[type] as Docs<unknown>;
    delete docs[id];
    ops.push({ store: KIND[type], delete: id });
  }

  // Calendars the account no longer has – with all that is in them.
  const live = new Set(result.calendarIds);
  for (const id of Object.keys(calendars)) {
    if (live.has(id) || waiting(local, "calendar", id)) continue;
    delete calendars[id];
    ops.push({ store: "calendars", delete: id }, ...dropContents(local, id));
  }
  // The stamps follow the calendars – and what others no longer share goes.
  ops.push(...tidyStamps(local, result.shared && new Set(result.shared)));
  // So do the account's own settings for them.
  ops.push(...tidyPrefs(local));

  const people = Object.fromEntries(
    result.people.map((person) => [person.id, person.name])
  );
  const invitations =
    result.invitations && openInvitations(local, result.invitations);
  local.since = result.now;
  local.known = result.calendarIds;
  ops.push(
    { store: "meta", put: result.now, key: "since" },
    { store: "meta", put: result.calendarIds, key: "known" },
    { store: "meta", put: people, key: "people" },
    { store: "meta", put: result.me, key: "me" }
  );
  if (invitations) {
    ops.push({ store: "meta", put: invitations, key: INVITATIONS });
  }
  await write(ops);
  set(local, { people, me: result.me, ...(invitations && { invitations }) });
};
