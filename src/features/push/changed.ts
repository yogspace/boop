import type { CollectionAfterChangeHook, Payload } from "payload";
import { getDictionary } from "@/features/translations/get-texts";
import { LOCALES } from "@/i18n/config";
import { devicesOf, peopleOf, settingsOf } from "./read";
import {
  aboutOf,
  CHANGED_GATHER_MS,
  CHANGED_WINDOW_MS,
  type CalendarChange,
  calendarChanges,
  changedMessage,
  changedTargets,
  createBundle,
  loginLasts,
  noteChanges,
  placementChanges,
  refOf,
  type Written,
} from "./rules";
import { forget, pushReady, sendPush } from "./send";

/**
 * “Anna wrote a note in ‘Family’” – to the calendar's other members who
 * switched it on (rules.ts, `changedTargets`), in each device's language.
 *
 * Hooks on notes, placements and calendars: a write made for a person –
 * the sync, the member and invitation endpoints, which name them in the
 * context (`context.by`). Without one it is the server's own (cleanup, an
 * account deleted): no news. What a write changed is rules.ts' to say
 * (`noteChanges` …); the bundle (`createBundle`) makes one message of a
 * person's changes in a calendar for a while, and on the device a new one
 * replaces the one before (its tag). Sent after the hook has returned –
 * the sync never waits for it, and nothing here can make it fail.
 */

/** A notification lives this long at the push service, waiting for a device that's off. */
const TTL_SECONDS = 12 * 60 * 60;

const bundle = createBundle(CHANGED_WINDOW_MS, CHANGED_GATHER_MS);

type Doc = Record<string, unknown>;

const changedHook =
  (
    changesOf: (written: Written) => CalendarChange[],
    calendarOf: (doc: Doc) => string | null
  ): CollectionAfterChangeHook =>
  ({ doc, previousDoc, operation, context, req }) => {
    const by = typeof context.by === "string" && context.by ? context.by : null;
    if (!(context.sync && by) || !pushReady()) return doc;
    const { payload } = req;
    try {
      const calendar = calendarOf(doc);
      if (!calendar) return doc;
      const key = `${calendar}:${by}`;
      const changes = changesOf({ operation, doc, previous: previousDoc, by });
      for (const change of changes) {
        const due = bundle.add(key, change);
        if (due !== null) later(payload, { calendar, by, key }, due);
      }
    } catch (error) {
      payload.logger.warn({ err: error, msg: "[push] changed" });
    }
    return doc;
  };

export const notifyNoteChanged = changedHook(noteChanges, (doc) =>
  refOf(doc.calendar)
);

export const notifyPlacementChanged = changedHook(placementChanges, (doc) =>
  refOf(doc.calendar)
);

export const notifyCalendarChanged = changedHook(calendarChanges, (doc) =>
  refOf(doc.id)
);

/**
 * What the bundle holds for the key, told when it is due. Without `req`:
 * the sync's own work (and its transaction) is done by then.
 */
const later = (
  payload: Payload,
  { calendar, by, key }: { calendar: string; by: string; key: string },
  due: number
) => {
  const timer = setTimeout(
    () => {
      const changes = bundle.take(key);
      if (!changes) return;
      tellOthers(payload, { calendar, by, changes }).catch((error) =>
        payload.logger.warn({ err: error, msg: "[push] changed" })
      );
    },
    Math.max(0, due - Date.now())
  );
  // A window still open never keeps the process up.
  timer.unref?.();
};

const tellOthers = async (
  payload: Payload,
  {
    calendar,
    by,
    changes,
  }: { calendar: string; by: string; changes: CalendarChange[] }
) => {
  const doc = (await payload.findByID({
    collection: "calendars",
    id: calendar,
    select: { name: true, members: true, deleted: true },
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  })) as { name?: string; members?: unknown[]; deleted?: boolean } | null;
  if (!doc || doc.deleted) return;
  const members = (doc.members ?? [])
    .map(refOf)
    .filter((id): id is string => Boolean(id));
  const about = aboutOf(changes);
  const others = members.filter((id) => id !== by && !about.includes(id));
  if (!others.length) return;

  const [devices, settings, people] = await Promise.all([
    devicesOf(payload, others),
    settingsOf(payload, others),
    peopleOf(payload, [...new Set([...others, by, ...about])]),
  ]);
  if (!devices.length) return;
  const now = new Date();
  const sessions = Object.fromEntries(
    Object.entries(people).map(([id, person]) => [id, person.sessions])
  );
  const targets = changedTargets({
    calendar,
    members,
    by,
    about,
    devices,
    settings,
    sessions,
    now,
  });
  // Devices whose login is over hear nothing more – they go.
  await forget(
    payload,
    devices
      .filter((device) => !loginLasts(device, sessions[device.account], now))
      .map((device) => device.id)
  );

  const names = Object.fromEntries(
    about.map((id) => [id, people[id]?.name ?? ""])
  );
  for (const locale of LOCALES) {
    const mine = targets.filter((device) => device.locale === locale);
    if (!mine.length) continue;
    const message = changedMessage(
      locale,
      {
        name: people[by]?.name ?? "",
        calendar: { id: calendar, name: doc.name ?? "" },
        changes,
        people: names,
      },
      (await getDictionary(locale)).app.push
    );
    if (message) await sendPush(payload, mine, message, { ttl: TTL_SECONDS });
  }
};
