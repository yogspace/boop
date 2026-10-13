"use client";

import { Checkbox, Notice } from "@/components/ui";
import { useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { usePush } from "./use-push";

/**
 * The account's own notifications, in its sheet (app/account-sheet.tsx):
 * the switches that are no calendar's – “someone invites me to a calendar”,
 * which one isn't in yet, and “Boop gives me a stamp” (features/cards).
 * They are the account's, on every device, like a calendar's switches
 * (notification-settings.tsx).
 *
 * Whether this device hears anything is said and changed there, in a
 * calendar's settings; here only a word when it doesn't – the box works all
 * the same, for the devices that do.
 *
 * Nothing shows while the server has no keys (notifications off), and
 * nothing changes without a connection: the box stays as last heard,
 * asleep, with a word why.
 */
export const AccountNotifications = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale).app.push;
  const { online } = useBoop();
  const { state, device, failed, save } = usePush(online);

  // Off on the server – not offered at all. Never heard from the server
  // (offline from the start) – nothing yet.
  if (!state?.enabled) return null;

  // Still looking: no word yet.
  const quiet = device !== null && device !== "on";

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-black text-lg">{t.title}</h3>
      <Checkbox
        aria-describedby={quiet ? "push-device-off" : undefined}
        checked={state.invited}
        disabled={!online}
        onChange={(event) => {
          const invited = event.target.checked;
          void save({ invited }, (now) => ({ ...now, invited }));
        }}
      >
        {t.invited}
      </Checkbox>
      <Checkbox
        aria-describedby={quiet ? "push-device-off" : undefined}
        checked={state.gifts !== false}
        disabled={!online}
        onChange={(event) => {
          const gifts = event.target.checked;
          void save({ gifts }, (now) => ({ ...now, gifts }));
        }}
      >
        {t.gifts}
      </Checkbox>
      {/* Under the words, past the box. A browser that can't has nowhere
          to turn them on. */}
      {quiet && (
        <p
          className="pl-7.5 font-medium text-muted text-xs"
          id="push-device-off"
        >
          {device === "unsupported" ? t.unsupported : t.deviceOff}
        </p>
      )}
      {!online && <Notice>{t.offline}</Notice>}
      {failed && <Notice tone="error">{t.failed}</Notice>}
    </div>
  );
};
