import type { FeedState } from "./endpoints";

/**
 * A calendar's feed address, from the browser: is there one, make one, a
 * new one, take it back – and the calendar once, as a file (endpoints.ts).
 * All of it needs a connection: the server has the address, and the last
 * word on who may have one.
 */

/**
 * The last answers, by account and calendar – shown at once when the
 * settings open again. By account: an address is one's own, never the next
 * login's on this device.
 */
const known = new Map<string, FeedState>();

const keyOf = (account: string, calendar: string) => `${account}/${calendar}`;

export const knownFeed = (account: string, calendar: string) =>
  known.get(keyOf(account, calendar)) ?? null;

const call = async (
  account: string,
  calendar: string,
  method: "GET" | "POST" | "DELETE",
  path = ""
) => {
  const response = await fetch(
    `/api/ical/feeds/${encodeURIComponent(calendar)}${path}`,
    { method, credentials: "same-origin" }
  );
  if (!response.ok) throw new Error(`ical ${response.status}`);
  const state = (await response.json()) as FeedState;
  known.set(keyOf(account, calendar), state);
  return state;
};

export const loadFeed = (account: string, calendar: string) =>
  call(account, calendar, "GET");

/** Makes the address – or hands back the one there is. */
export const createFeed = (account: string, calendar: string) =>
  call(account, calendar, "POST");

/** A new address – the old one is dead at once. */
export const renewFeed = (account: string, calendar: string) =>
  call(account, calendar, "POST", "/renew");

export const revokeFeed = (account: string, calendar: string) =>
  call(account, calendar, "DELETE");

/**
 * The address as a calendar app takes it from a link: `webcal://` opens the
 * app's “subscribe?” instead of the file in the browser.
 */
export const webcalOf = (url: string) => url.replace(/^https?:/, "webcal:");

/** The calendar as a file (.ics) – what the feed says, once. */
export const fetchCalendarFile = async (calendar: string): Promise<File> => {
  const response = await fetch(
    `/api/ical/export/${encodeURIComponent(calendar)}`,
    { method: "POST", credentials: "same-origin" }
  );
  if (!response.ok) throw new Error(`ical ${response.status}`);
  // Named by the server, after the calendar – in full where the header
  // says so (`filename*`), else as its slug.
  const header = response.headers.get("content-disposition") ?? "";
  const full = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  const plain = /filename="([^"]+)"/.exec(header)?.[1];
  let name = plain ?? "boop.ics";
  try {
    if (full) name = decodeURIComponent(full);
  } catch {
    // Not a name after all – the plain one does.
  }
  return new File([await response.blob()], name, { type: "text/calendar" });
};
