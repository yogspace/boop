import type { Payload } from "payload";
import { getDictionary } from "@/features/translations/get-texts";
import { peopleOf, settingsOf } from "./read";
import {
  enteredIn,
  loginLasts,
  openCalendars,
  reminderAtOf,
  reminderDue,
  reminderMessage,
  rowOf,
  type SubscriptionRow,
  secondsLeftOfDay,
} from "./rules";
import { forget, pushReady, sendPush } from "./send";

/**
 * The evening's reminder (/next/cron/push-reminder, every 15 minutes): each
 * device whose time has come on its clock (the account's, 20:00 unless set)
 * and that got none today yet hears which of the account's calendars still
 * wait for an entry of its own today – a print, or the day's note – in one
 * notification, naming them all. With nothing open it hears nothing, and
 * that counts as reminded too: one look a day. What counts as an entry
 * (`enteredIn`) and which calendars count (each one's switch): rules.ts.
 *
 * `dry` only counts – nothing is sent, noted or deleted.
 */

export type ReminderTally = {
  /** Notifications on at all (VAPID keys there)? */
  enabled: boolean;
  devices: number;
  /** Devices whose time had come. */
  due: number;
  sent: number;
  /** Due, but every calendar had an entry of its own already. */
  nothingOpen: number;
  /** Their login was over – deleted. */
  loggedOut: number;
  /** Their push service no longer knew them – deleted. */
  gone: number;
  /** Not sent this time – tried again at the next round. */
  failed: number;
};

type Calendar = { id: string; name: string };

export const runReminders = async (
  payload: Payload,
  { dry = false, now = new Date() }: { dry?: boolean; now?: Date } = {}
): Promise<ReminderTally> => {
  const tally: ReminderTally = {
    enabled: pushReady(),
    devices: 0,
    due: 0,
    sent: 0,
    nothingOpen: 0,
    loggedOut: 0,
    gone: 0,
    failed: 0,
  };
  if (!tally.enabled) return tally;

  const { docs } = await payload.find({
    collection: "push-subscriptions",
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const devices = (docs as unknown as Record<string, unknown>[])
    .map(rowOf)
    .filter((row): row is SubscriptionRow => Boolean(row));
  tally.devices = devices.length;
  const settings = await settingsOf(payload, unique(devices.map(accountOf)));
  const due = devices.flatMap((device) => {
    const day = reminderDue(
      device,
      reminderAtOf(settings[device.account]),
      now
    );
    return day ? [{ device, day }] : [];
  });
  tally.due = due.length;
  if (!due.length) return tally;

  // Logged out since – they hear nothing more, and go.
  const people = await peopleOf(
    payload,
    unique(due.map(({ device }) => device.account))
  );
  const lasts = ({ device }: { device: SubscriptionRow }) =>
    loginLasts(device, people[device.account]?.sessions, now);
  const over = due.filter((entry) => !lasts(entry));
  tally.loggedOut = over.length;
  if (!dry)
    await forget(
      payload,
      over.map(({ device }) => device.id)
    );
  const live = due.filter(lasts);

  // The account's calendars, and its entries on a day – asked once each.
  const calendars = new Map<string, Calendar[]>();
  for (const account of unique(live.map(({ device }) => device.account))) {
    calendars.set(account, await calendarsOf(payload, account));
  }
  const entered = new Map<string, Promise<Set<string>>>();
  const enteredOn = (account: string, day: string) => {
    const key = `${account}:${day}`;
    if (!entered.has(key)) {
      entered.set(
        key,
        entriesOn(payload, account, day, calendars.get(account) ?? [])
      );
    }
    return entered.get(key) as Promise<Set<string>>;
  };

  const reminded = new Map<string, string[]>();
  for (const { device, day } of live) {
    const open = openCalendars({
      calendars: calendars.get(device.account) ?? [],
      settings: settings[device.account],
      entered: await enteredOn(device.account, day),
    });
    if (!open.length) {
      tally.nothingOpen++;
    } else if (dry) {
      tally.sent++;
    } else {
      const result = await sendPush(
        payload,
        [device],
        reminderMessage(
          device.locale,
          open,
          (await getDictionary(device.locale)).app.push
        ),
        { ttl: secondsLeftOfDay(device.timeZone, now) }
      );
      tally.sent += result.sent;
      tally.gone += result.gone;
      tally.failed += result.failed;
      if (!result.sent) continue;
    }
    reminded.set(day, [...(reminded.get(day) ?? []), device.id]);
  }

  if (!dry) {
    for (const [day, ids] of reminded) {
      await payload.update({
        collection: "push-subscriptions",
        where: { id: { in: ids } },
        data: { remindedOn: day },
        depth: 0,
        overrideAccess: true,
      });
    }
  }
  return tally;
};

const unique = (ids: string[]) => [...new Set(ids)];

const accountOf = (device: SubscriptionRow) => device.account;

/** The (not deleted) calendars the account is a member of. */
const calendarsOf = async (
  payload: Payload,
  account: string
): Promise<Calendar[]> => {
  const { docs } = await payload.find({
    collection: "calendars",
    where: {
      and: [
        { members: { equals: account } },
        { deleted: { not_equals: true } },
      ],
    },
    select: { name: true },
    sort: "name",
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  return docs.map((doc) => ({
    id: String(doc.id),
    name: String((doc as { name?: unknown }).name ?? ""),
  }));
};

/**
 * The calendars with an entry of the account on that day – its prints and
 * the notes it wrote last, asked for as such; `enteredIn` says what counts.
 */
const entriesOn = async (
  payload: Payload,
  account: string,
  day: string,
  calendars: Calendar[]
): Promise<Set<string>> => {
  if (!calendars.length) return new Set();
  const find = async (collection: "placements" | "notes", by: string) => {
    const { docs } = await payload.find({
      collection,
      where: {
        and: [
          { [by]: { equals: account } },
          { date: { equals: day } },
          { calendar: { in: calendars.map((calendar) => calendar.id) } },
          { deleted: { not_equals: true } },
        ],
      },
      select: { calendar: true, date: true, deleted: true, [by]: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    });
    return docs as unknown as Record<string, unknown>[];
  };
  const [prints, notes] = await Promise.all([
    find("placements", "placedBy"),
    find("notes", "editedBy"),
  ]);
  return enteredIn({ account, day, prints, notes });
};
