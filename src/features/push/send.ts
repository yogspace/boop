import type { Payload } from "payload";
import webpush, { WebPushError } from "web-push";
import { serverUrl } from "@/lib/server-url";
import type { PushMessage, SubscriptionRow } from "./rules";

/**
 * Sending, with the Web Push protocol: the message, encrypted for the
 * device, goes to its browser's push service (Apple, Google, Mozilla,
 * Microsoft), which hands it on. Signed with our VAPID keys – without them
 * in the environment, notifications are off: nothing is sent, the app
 * doesn't offer them, nothing breaks.
 *
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   npx web-push generate-vapid-keys
 *   VAPID_SUBJECT                         optional: mailto:… or https://…
 */

let ready: boolean | null = null;

/** Our public key – the browser subscribes with it. */
export const vapidPublicKey = () =>
  process.env.VAPID_PUBLIC_KEY?.trim() || null;

/**
 * Whom the push services may ask about our messages: VAPID_SUBJECT, else
 * the site (only an https address counts – mailto: on a local machine).
 */
const subject = () => {
  const own = process.env.VAPID_SUBJECT?.trim();
  if (own) return own;
  const site = serverUrl();
  return site.startsWith("https://") ? site : "mailto:boop@localhost";
};

/** Are notifications on – both keys there, and good? Checked once. */
export const pushReady = (): boolean => {
  if (ready !== null) return ready;
  const publicKey = vapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!(publicKey && privateKey)) {
    ready = false;
    return ready;
  }
  try {
    webpush.setVapidDetails(subject(), publicKey, privateKey);
    ready = true;
  } catch (error) {
    console.warn(
      `[push] VAPID keys refused – notifications are off: ${error instanceof Error ? error.message : error}`
    );
    ready = false;
  }
  return ready;
};

export type SendTally = { sent: number; gone: number; failed: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sends one message to these devices. A device its push service no longer
 * knows (404, 410 – unsubscribed, uninstalled, run out) is deleted; any
 * other trouble is logged and counted, never thrown.
 */
export const sendPush = async (
  payload: Payload,
  devices: readonly SubscriptionRow[],
  message: PushMessage,
  { ttl }: { ttl: number }
): Promise<SendTally> => {
  const tally: SendTally = { sent: 0, gone: 0, failed: 0 };
  if (!(devices.length && pushReady())) return tally;
  const body = JSON.stringify(message);
  const now = Date.now();
  await Promise.all(
    devices.map(async (device) => {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: device.keys },
          body,
          { TTL: Math.round(ttl), urgency: "normal", timeout: 10_000 }
        );
        tally.sent++;
        // Used – noted once a day at most.
        const last = device.lastUsedAt ? Date.parse(device.lastUsedAt) : 0;
        if (!(now - last < DAY_MS)) {
          await payload
            .update({
              collection: "push-subscriptions",
              id: device.id,
              data: { lastUsedAt: new Date(now).toISOString() },
              depth: 0,
              overrideAccess: true,
            })
            .catch(() => undefined);
        }
      } catch (error) {
        if (
          error instanceof WebPushError &&
          (error.statusCode === 404 || error.statusCode === 410)
        ) {
          tally.gone++;
          await forget(payload, [device.id]);
          return;
        }
        tally.failed++;
        payload.logger.warn({
          msg: `[push] not sent: ${error instanceof WebPushError ? `${error.statusCode} ${error.body}` : error instanceof Error ? error.message : error}`,
        });
      }
    })
  );
  return tally;
};

/** Devices that won't hear again – deleted. */
export const forget = async (payload: Payload, ids: readonly string[]) => {
  if (!ids.length) return;
  await payload
    .delete({
      collection: "push-subscriptions",
      where: { id: { in: [...ids] } },
      overrideAccess: true,
    })
    .catch((error) =>
      payload.logger.warn({ err: error, msg: "[push] devices not deleted" })
    );
};
