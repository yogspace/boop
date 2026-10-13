import type { Payload } from "payload";
import { getDictionary } from "@/features/translations/get-texts";
import { LOCALES } from "@/i18n/config";
import { devicesOf, peopleOf, settingsOf } from "./read";
import {
  createThrottle,
  INVITED_WINDOW_MS,
  invitedMessage,
  invitedTargets,
  loginLasts,
} from "./rules";
import { forget, pushReady, sendPush } from "./send";

/**
 * “Anna invited you to ‘Family’” – to the one invited, on the devices they
 * are logged in on, unless they switched it off (rules.ts,
 * `invitedTargets`), in each device's language. A tap opens the app.
 *
 * `notifyInvited` knows nothing of how calendars are shared: whoever makes
 * an invitation calls it, with who is invited, to which calendar, and by
 * whom – and decides itself whether there is one to tell of (someone
 * already in the calendar is not invited again). Whoever joins by a mail's
 * link is never told: that was their own doing.
 *
 * The same invitation again within a few minutes is one notification (the
 * throttle), and on the device a new one replaces the one before (its
 * tag). Sent after the caller has gone on: it never waits for it, and
 * nothing here can make it fail.
 */

/** An invitation, as far as its notification goes – accounts and a calendar by id. */
export type Invitation = {
  /** The calendar it is to. */
  calendar: string;
  /** Who is invited. */
  who: string;
  /** Who invites them. */
  by: string;
};

/**
 * Longer than the others: this one stays news until they have seen it – a
 * device that's off for a weekend still gets it.
 */
const TTL_SECONDS = 3 * 24 * 60 * 60;

const throttle = createThrottle(INVITED_WINDOW_MS);

export const notifyInvited = (payload: Payload, invitation: Invitation) => {
  const { calendar, who, by } = invitation;
  if (!pushReady() || who === by) return;
  if (!throttle(`${calendar}:${who}`)) return;
  // Without `req`: the caller's own work (and its transaction) is done by
  // the time this asks the database.
  setTimeout(() => {
    tellThem(payload, invitation).catch((error) =>
      payload.logger.warn({ err: error, msg: "[push] invited" })
    );
  }, 0);
};

const tellThem = async (payload: Payload, { calendar, who, by }: Invitation) => {
  const doc = (await payload.findByID({
    collection: "calendars",
    id: calendar,
    select: { name: true, deleted: true },
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  })) as { name?: string; deleted?: boolean } | null;
  if (!doc || doc.deleted) return;

  const [devices, settings, people] = await Promise.all([
    devicesOf(payload, [who]),
    settingsOf(payload, [who]),
    peopleOf(payload, [who, by]),
  ]);
  if (!devices.length) return;
  const now = new Date();
  const sessions = Object.fromEntries(
    Object.entries(people).map(([id, person]) => [id, person.sessions])
  );
  const targets = invitedTargets({
    who,
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
      invitedMessage(
        locale,
        { name, calendar: { id: calendar, name: doc.name ?? "" } },
        (await getDictionary(locale)).app.push
      ),
      { ttl: TTL_SECONDS }
    );
  }
};
