import type { CollectionAfterChangeHook, Payload } from "payload";
import { getDictionary } from "@/features/translations/get-texts";
import { LOCALES } from "@/i18n/config";
import { devicesOf, peopleOf, settingsOf } from "./read";
import {
  createThrottle,
  loginLasts,
  refOf,
  STAMPED_WINDOW_MS,
  stampedMessage,
  stampedTargets,
} from "./rules";
import { forget, pushReady, sendPush } from "./send";

/**
 * “Anna stamped in ‘Family’” – to the calendar's other members whose
 * switch is on (rules.ts, `stampedTargets`), in each device's language.
 *
 * A placements hook: a print new on the server, from a device's sync
 * (`context.sync` – not the admin's). Several prints of one person in one
 * calendar within a few minutes are one notification (the throttle), and on
 * the device a new one replaces the one before (its tag). Sent after the
 * hook has returned: the sync never waits for it, and nothing here can make
 * it fail.
 */

/** A notification lives this long at the push service, waiting for a device that's off. */
const TTL_SECONDS = 12 * 60 * 60;

const throttle = createThrottle(STAMPED_WINDOW_MS);

export const notifyStamped: CollectionAfterChangeHook = ({
  doc,
  operation,
  context,
  req,
}) => {
  if (operation !== "create" || !context.sync || doc.deleted) return doc;
  if (!pushReady()) return doc;
  const calendar = refOf(doc.calendar);
  const by = refOf(doc.placedBy);
  if (!(calendar && by && throttle(`${calendar}:${by}`))) return doc;
  // Without `req`: the sync's own work (and its transaction) is done by
  // the time this asks the database.
  const { payload } = req;
  setTimeout(() => {
    tellOthers(payload, { calendar, by }).catch((error) =>
      payload.logger.warn({ err: error, msg: "[push] stamped" })
    );
  }, 0);
  return doc;
};

const tellOthers = async (
  payload: Payload,
  { calendar, by }: { calendar: string; by: string }
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
  const others = members.filter((id) => id !== by);
  if (!others.length) return;

  const [devices, settings, people] = await Promise.all([
    devicesOf(payload, others),
    settingsOf(payload, others),
    peopleOf(payload, [...others, by]),
  ]);
  if (!devices.length) return;
  const now = new Date();
  const sessions = Object.fromEntries(
    Object.entries(people).map(([id, person]) => [id, person.sessions])
  );
  const targets = stampedTargets({
    calendar,
    members,
    by,
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

  const name = people[by]?.name ?? "";
  for (const locale of LOCALES) {
    const mine = targets.filter((device) => device.locale === locale);
    if (!mine.length) continue;
    await sendPush(
      payload,
      mine,
      stampedMessage(
        locale,
        { name, calendar: { id: calendar, name: doc.name ?? "" } },
        (await getDictionary(locale)).app.push
      ),
      { ttl: TTL_SECONDS }
    );
  }
};
