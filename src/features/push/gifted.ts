import type { Payload } from "payload";
import { getDictionary } from "@/features/translations/get-texts";
import { LOCALES, type Locale } from "@/i18n/config";
import { devicesOf, peopleOf, settingsOf } from "./read";
import { giftMessage, giftTargets, loginLasts } from "./rules";
import { forget, pushReady, sendPush } from "./send";

/**
 * “Boop gave you a stamp: ‘Pumpkin’” – to the accounts that just got a gift
 * from Boop (features/cards, gifts.ts), on the devices they are logged in
 * on, unless they switched it off (rules.ts, `giftTargets`), in each
 * device's language. A tap opens the app.
 *
 * The gift's sending calls it for each portion of accounts, once their
 * stamps are there; it waits for it, and nothing here can make it fail.
 * Cards tell nobody: their link goes to the person straight away.
 */

/** As long as an invitation's: a phone that's off for a weekend still hears. */
const TTL_SECONDS = 3 * 24 * 60 * 60;

export const notifyGifted = async (
  payload: Payload,
  {
    gift,
    name,
    accounts,
  }: {
    /** The gift's id – its tag on the device. */
    gift: string;
    /** Its name, per language. */
    name: Record<Locale, string>;
    accounts: readonly string[];
  }
) => {
  if (!(pushReady() && accounts.length)) return;
  try {
    const [devices, settings, people] = await Promise.all([
      devicesOf(payload, accounts),
      settingsOf(payload, accounts),
      peopleOf(payload, accounts),
    ]);
    if (!devices.length) return;
    const now = new Date();
    const sessions = Object.fromEntries(
      Object.entries(people).map(([id, person]) => [id, person.sessions])
    );
    const targets = giftTargets({ devices, settings, sessions, now });
    // Devices whose login is over hear nothing more – they go.
    await forget(
      payload,
      devices
        .filter((device) => !loginLasts(device, sessions[device.account], now))
        .map((device) => device.id)
    );
    for (const locale of LOCALES) {
      const mine = targets.filter((device) => device.locale === locale);
      if (!mine.length) continue;
      await sendPush(
        payload,
        mine,
        giftMessage(
          locale,
          { gift, name: name[locale] },
          (await getDictionary(locale)).app.push
        ),
        { ttl: TTL_SECONDS }
      );
    }
  } catch (error) {
    payload.logger.warn({ err: error, msg: "[push] gifted" });
  }
};
