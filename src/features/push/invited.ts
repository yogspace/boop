import type { Payload } from "payload";
import { getDictionary } from "@/features/translations/get-texts";
import { LOCALES } from "@/i18n/config";
import { devicesOf, peopleOf, settingsOf } from "./read";
import {
  type Added,
  createThrottle,
  INVITED_WINDOW_MS,
  invitedMessage,
  invitedTargets,
  loginLasts,
  refOf,
  wasAdded,
} from "./rules";
import { forget, pushReady, sendPush } from "./send";

/**
 * “Anna added you to ‘Family’” – to the one added, on the devices they are
 * logged in on, unless they switched it off (rules.ts, `invitedTargets`),
 * in each device's language. A tap opens the calendar.
 *
 * Called by the member endpoint (calendar/endpoints/members.ts) when the
 * owner adds an account – with the members as they were: one already in
 * hears nothing. Whoever joins by an invitation's link hears nothing
 * either; that was their own doing (calendar/invites.ts never calls this).
 * The other members hear of it as a change, the one added left out
 * (changed.ts) – so nobody hears it twice.
 *
 * Out and in again within a few minutes is one notification (the
 * throttle), and on the device a new one replaces the one before (its
 * tag). Sent after the endpoint has answered: it never waits for it, and
 * nothing here can make it fail.
 */

/**
 * Longer than the others: this one stays news until they have seen the
 * calendar – a device that's off for a weekend still gets it.
 */
const TTL_SECONDS = 3 * 24 * 60 * 60;

const throttle = createThrottle(INVITED_WINDOW_MS);

export const notifyInvited = (
  payload: Payload,
  { calendar, ...added }: Added & { calendar: string }
) => {
  if (!(pushReady() && wasAdded(added))) return;
  if (!throttle(`${calendar}:${added.who}`)) return;
  // Without `req`: the endpoint's own work is done by the time this asks
  // the database.
  setTimeout(() => {
    tellThem(payload, { calendar, ...added }).catch((error) =>
      payload.logger.warn({ err: error, msg: "[push] invited" })
    );
  }, 0);
};

const tellThem = async (
  payload: Payload,
  { calendar, ...added }: Added & { calendar: string }
) => {
  const { who, by } = added;
  const doc = (await payload.findByID({
    collection: "calendars",
    id: calendar,
    select: { name: true, members: true, deleted: true },
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  })) as { name?: string; members?: unknown[]; deleted?: boolean } | null;
  // Gone again meanwhile – the calendar, or they from it: nothing to tell.
  if (!doc || doc.deleted) return;
  if (!(doc.members ?? []).map(refOf).includes(who)) return;

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
    ...added,
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
