import type { Endpoint, PayloadRequest } from "payload";
import {
  type SessionAccount,
  sessionAccount,
} from "@/features/accounts/session";
import { calendarsOf } from "@/features/calendar/membership";
import { isLocale } from "@/i18n/config";
import { rateLimit } from "@/lib/rate-limit";
import {
  cleanReminderAt,
  DEFAULT_TIME_ZONE,
  isPushEndpoint,
  isPushKey,
  isTimeZone,
  type PushSettingsDoc,
  reminderAtOf,
  type Switches,
  switchesOf,
  withSwitch,
} from "./rules";
import { pushReady, vapidPublicKey } from "./send";

/**
 * The app's way to its notifications – always the own account's, found by
 * the app's cookie (`sessionAccount`, which refuses requests from other
 * sites):
 *
 *   GET   /api/push              on at all? our public key, the settings
 *   POST  /api/push/subscribe    { subscription, timeZone, locale, previous? }
 *   POST  /api/push/unsubscribe  { endpoint }
 *   PATCH /api/push/settings     { reminderAt } or { calendar, reminder?, stamped? }
 *
 * A device is known by its push service's address (`endpoint`): saying yes
 * again – after a new login, from another account, with another zone –
 * updates it, and ties it to the login it came with.
 */

// Opening the settings, switching, picking a time – far below this.
const tooMany = rateLimit({ limit: 120, windowMs: 60 * 60 * 1000 });

type Doc = Record<string, unknown>;

/** What the app hears back: the account's settings, for its calendars. */
export type PushState = {
  /** Notifications on at all – the server has its keys. */
  enabled: boolean;
  /** Ours, for the browser's subscription. */
  publicKey: string | null;
  reminderAt: string;
  /** The switches per calendar the account is in. */
  calendars: Record<string, Switches>;
};

const json = async (req: PayloadRequest) =>
  ((await req.json?.().catch(() => null)) ?? {}) as Doc;

/** The account – or the answer that refuses. */
const guard = async (
  req: PayloadRequest
): Promise<SessionAccount | Response> => {
  const me = await sessionAccount(req);
  if (!me) return Response.json({ error: "Not logged in." }, { status: 401 });
  if (tooMany(String(me.id))) {
    return Response.json({ error: "Too many tries." }, { status: 429 });
  }
  return me;
};

const settingsDoc = async (req: PayloadRequest, me: string) => {
  const { docs } = await req.payload.find({
    collection: "push-settings",
    where: { account: { equals: me } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });
  return (
    (docs[0] as unknown as (PushSettingsDoc & { id: unknown }) | undefined) ??
    null
  );
};

const stateOf = (
  doc: PushSettingsDoc | null,
  mine: ReadonlySet<string>
): PushState => {
  const enabled = pushReady();
  return {
    enabled,
    publicKey: enabled ? vapidPublicKey() : null,
    reminderAt: reminderAtOf(doc),
    calendars: Object.fromEntries(
      [...mine].map((calendar) => [calendar, switchesOf(doc, calendar)])
    ),
  };
};

const myCalendars = async (req: PayloadRequest, me: string) =>
  new Set((await calendarsOf(req, me)).map((calendar) => calendar.id));

/** The device the endpoint names, if any – whoever's it is. */
const deviceAt = async (req: PayloadRequest, endpoint: string) => {
  const { docs } = await req.payload.find({
    collection: "push-subscriptions",
    where: { endpoint: { equals: endpoint } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });
  return (docs[0] as unknown as Doc | undefined) ?? null;
};

export const pushEndpoints: Endpoint[] = [
  {
    path: "/push",
    method: "get",
    handler: async (req) => {
      const me = await guard(req);
      if (me instanceof Response) return me;
      const id = String(me.id);
      const [doc, mine] = await Promise.all([
        settingsDoc(req, id),
        myCalendars(req, id),
      ]);
      return Response.json(stateOf(doc, mine), {
        headers: { "Cache-Control": "no-store" },
      });
    },
  },
  {
    // This device says yes – or says it again.
    path: "/push/subscribe",
    method: "post",
    handler: async (req) => {
      const me = await guard(req);
      if (me instanceof Response) return me;
      if (!pushReady()) {
        return Response.json(
          { error: "Notifications are off." },
          { status: 503 }
        );
      }
      const body = await json(req);
      const subscription = (body.subscription ?? {}) as Doc;
      const keys = (subscription.keys ?? {}) as Doc;
      const { endpoint } = subscription;
      if (
        !(
          isPushEndpoint(endpoint) &&
          isPushKey(keys.p256dh, 200) &&
          isPushKey(keys.auth, 64)
        )
      ) {
        return Response.json({ error: "No subscription." }, { status: 400 });
      }
      const account = String(me.id);
      const existing = await deviceAt(req, endpoint);
      // The browser renewed it (sw-push.js): the old one's place is taken.
      const previous =
        isPushEndpoint(body.previous) && body.previous !== endpoint
          ? await deviceAt(req, body.previous)
          : null;
      const before =
        existing ??
        (previous && String(previous.account) === account ? previous : null);
      const data = {
        account,
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        session: me._sid ?? null,
        timeZone: isTimeZone(body.timeZone)
          ? body.timeZone
          : isTimeZone(before?.timeZone)
            ? before.timeZone
            : DEFAULT_TIME_ZONE,
        locale: isLocale(body.locale)
          ? body.locale
          : isLocale(before?.locale)
            ? before.locale
            : isLocale(me.locale)
              ? me.locale
              : "de",
        ...(before?.remindedOn ? { remindedOn: before.remindedOn } : {}),
        lastUsedAt: new Date().toISOString(),
      };
      if (previous && String(previous.account) === account) {
        await req.payload.delete({
          collection: "push-subscriptions",
          id: String(previous.id),
          overrideAccess: true,
          req,
        });
      }
      if (existing) {
        await req.payload.update({
          collection: "push-subscriptions",
          id: String(existing.id),
          data: data as never,
          depth: 0,
          overrideAccess: true,
          req,
        });
      } else {
        await req.payload.create({
          collection: "push-subscriptions",
          data: data as never,
          depth: 0,
          overrideAccess: true,
          req,
        });
      }
      return Response.json({ ok: true });
    },
  },
  {
    // This device says no more. The browser forgets it itself.
    path: "/push/unsubscribe",
    method: "post",
    handler: async (req) => {
      const me = await guard(req);
      if (me instanceof Response) return me;
      const { endpoint } = await json(req);
      if (typeof endpoint !== "string" || !endpoint) {
        return Response.json({ error: "No endpoint." }, { status: 400 });
      }
      await req.payload.delete({
        collection: "push-subscriptions",
        where: {
          and: [
            { endpoint: { equals: endpoint } },
            { account: { equals: String(me.id) } },
          ],
        },
        overrideAccess: true,
        req,
      });
      return Response.json({ ok: true });
    },
  },
  {
    // The reminder's time, or one calendar's switches.
    path: "/push/settings",
    method: "patch",
    handler: async (req) => {
      const me = await guard(req);
      if (me instanceof Response) return me;
      const account = String(me.id);
      const body = await json(req);
      const reminderAt =
        "reminderAt" in body ? cleanReminderAt(body.reminderAt) : undefined;
      if (reminderAt === null) {
        return Response.json({ error: "No time." }, { status: 400 });
      }
      const [doc, mine] = await Promise.all([
        settingsDoc(req, account),
        myCalendars(req, account),
      ]);
      let change: Parameters<typeof withSwitch>[2];
      if ("calendar" in body) {
        const calendar = String(body.calendar ?? "");
        if (!mine.has(calendar)) {
          return Response.json(
            { error: "Not your calendar." },
            { status: 403 }
          );
        }
        change = {
          calendar,
          ...(typeof body.reminder === "boolean" && {
            reminder: body.reminder,
          }),
          ...(typeof body.stamped === "boolean" && { stamped: body.stamped }),
        };
      }
      const data = {
        reminderAt: reminderAt ?? reminderAtOf(doc),
        calendars: withSwitch(doc, mine, change),
      };
      const saved = doc
        ? await req.payload.update({
            collection: "push-settings",
            id: String(doc.id),
            data,
            depth: 0,
            overrideAccess: true,
            req,
          })
        : await req.payload.create({
            collection: "push-settings",
            data: { ...data, account },
            depth: 0,
            overrideAccess: true,
            req,
          });
      return Response.json(stateOf(saved as unknown as PushSettingsDoc, mine), {
        headers: { "Cache-Control": "no-store" },
      });
    },
  },
];
