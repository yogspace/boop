/**
 * Who hears of what, and when – plain functions of their arguments, tested
 * in test/push/rules.test.ts. The server's parts (stamped.ts, changed.ts,
 * invited.ts, gifted.ts, reminder.ts, endpoints.ts) ask the database and
 * hand them what it said.
 *
 * - Every account has three switches per calendar: the evening's reminder
 *   and “someone else stamped here”, on until switched off, and “someone
 *   else changed something”, off until switched on – it would be loud.
 *   Only what differs is kept (`PushSettingsDoc.calendars`).
 * - And two of its own, for no calendar: “someone invites me to one” and
 *   “Boop gives me a stamp”, on until switched off – kept only when off
 *   (`PushSettingsDoc.invited`, `.gifts`). The one invited hears it, nobody
 *   else (`invitedTargets`); a gift, whoever got it (`giftTargets`).
 * - A device (`SubscriptionRow`) hears only as long as the login it was
 *   switched on in lasts: logged out, it is quiet.
 * - The reminder comes once a day per device, at the account's time on the
 *   device's clock – naming the calendars still without an entry of its own
 *   that day: no print, no note (`enteredIn`).
 * - Changes are someone's notes, moved or removed prints, a new name, who
 *   came or went (`noteChanges`, `placementChanges`, `calendarChanges`),
 *   bundled per person and calendar (`createBundle`).
 *
 * The parts, in rules/: the switches (settings.ts), the clock (time.ts),
 * who hears (devices.ts), the changes (changes.ts), what a notification
 * says (messages.ts) and the push services (services.ts).
 */

export {
  aboutOf,
  type CalendarChange,
  CHANGED_GATHER_MS,
  CHANGED_WINDOW_MS,
  type ChangeKind,
  calendarChanges,
  createBundle,
  distinctChanges,
  noteChanges,
  placementChanges,
  type Written,
} from "./rules/changes";
export {
  changedTargets,
  createThrottle,
  enteredIn,
  giftTargets,
  INVITED_WINDOW_MS,
  invitedTargets,
  loginLasts,
  openCalendars,
  rowOf,
  type Session,
  STAMPED_WINDOW_MS,
  type SubscriptionRow,
  stampedTargets,
} from "./rules/devices";
export {
  calendarUrl,
  changedMessage,
  giftMessage,
  invitedMessage,
  type PushMessage,
  reminderMessage,
  stampedMessage,
} from "./rules/messages";
export { isPushEndpoint, isPushKey, pushServiceOf } from "./rules/services";
export {
  type CalendarEntry,
  DEFAULT_SWITCHES,
  entriesOf,
  giftsOf,
  invitedOf,
  type PushSettingsDoc,
  refOf,
  type Switches,
  switchesOf,
  withGifts,
  withInvited,
  withSwitch,
} from "./rules/settings";
export {
  cleanReminderAt,
  DEFAULT_REMINDER_AT,
  DEFAULT_TIME_ZONE,
  isTimeZone,
  LATEST_REMINDER_AT,
  localClock,
  minutesOf,
  reminderAtOf,
  reminderDue,
  secondsLeftOfDay,
} from "./rules/time";
