"use client";

import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "valtio";
import { Button, Checkbox, Field, Notice } from "@/components/ui";
import type { CalendarDoc } from "@/features/calendar/model";
import { useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { refreshPush, turnOff, turnOn } from "./client";
import { DEFAULT_SWITCHES, type Switches } from "./rules";
import { usePush } from "./use-push";

/**
 * A calendar's notifications, under “Just for you” in its settings: first
 * where this device stands – it can't, it's an iPhone not on the Home
 * Screen, it said no, it's off (the button), it's on – then, when on, the
 * account's switches for this calendar (the reminder; someone else
 * stamping, someone else changing something – asleep in a calendar of
 * one's own) and the reminder's time (one for all calendars). The switches are the account's, on every device; the yes
 * is the device's.
 *
 * Nothing shows while the server has no keys (notifications off), and
 * nothing changes without a connection: the switches stay as last heard,
 * asleep, with a word why.
 */
export const NotificationSettings = ({
  calendar,
  locale,
}: {
  calendar: Snapshot<CalendarDoc>;
  locale: Locale;
}) => {
  const t = dictionaryOf(locale).app.push;
  const { online, me } = useBoop();
  const account = me?.id;
  const { state, device, setDevice, failed, setFailed, save } = usePush(online);
  const [busy, setBusy] = useState(false);
  // The time while it is being picked – kept when the picker lets go.
  const [time, setTime] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // On here: the server hears so again – the login, zone and language now.
  const publicKey = state?.publicKey;
  useEffect(() => {
    if (device !== "on" || !publicKey || !online || !account) return;
    void refreshPush(locale, publicKey, account).then(
      (next) => next && setDevice(next)
    );
  }, [device, publicKey, online, locale, account, setDevice]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Off on the server – not offered at all. Still looking, or never heard
  // from the server (offline from the start) – nothing yet.
  if (!(state?.enabled && device)) return null;

  const switches = state?.calendars[calendar.id] ?? DEFAULT_SWITCHES;
  const shared = calendar.members.length > 1;
  const awake = online && Boolean(state) && !busy;

  /** Does something with the server – asleep meanwhile, a word if it fails. */
  const attempt = async (work: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    try {
      await work();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const enable = () =>
    attempt(async () => {
      if (!state?.publicKey) return;
      setDevice(await turnOn(state.publicKey, locale));
    });

  const disable = () => attempt(async () => setDevice(await turnOff()));

  /** A switch flips at once – and back, should the server say no. */
  const flip = (patch: Partial<Switches>) =>
    save({ calendar: calendar.id, ...patch }, (now) => ({
      ...now,
      calendars: {
        ...now.calendars,
        [calendar.id]: {
          ...(now.calendars[calendar.id] ?? DEFAULT_SWITCHES),
          ...patch,
        },
      },
    }));

  const keepTime = async (value: string) => {
    clearTimeout(timer.current);
    if (!(state && /^\d{2}:\d{2}$/.test(value)) || value === state.reminderAt) {
      setTime(null);
      return;
    }
    await save({ reminderAt: value }, (now) => ({ ...now, reminderAt: value }));
    setTime(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="font-bold text-sm">{t.title}</p>
      {device === "unsupported" && <Notice>{t.unsupported}</Notice>}
      {device === "install" && <Notice>{t.install}</Notice>}
      {device === "denied" && <Notice>{t.denied}</Notice>}
      {device === "off" && (
        <Button
          className="self-start"
          disabled={!(awake && state?.publicKey)}
          onClick={() => void enable()}
          size="sm"
          variant="plain"
        >
          {t.enable}
        </Button>
      )}
      {device === "on" && (
        <p className="font-medium text-muted text-sm">{t.on}</p>
      )}
      {/* The switches as last heard – none heard yet (offline): none shown. */}
      {device === "on" && state && (
        <>
          <Checkbox
            checked={switches.reminder}
            disabled={!awake}
            onChange={(event) => void flip({ reminder: event.target.checked })}
          >
            {t.reminder}
          </Checkbox>
          {/* About someone else – there in a calendar of one's own too, so
              they can be found, but asleep until someone else is in it. */}
          <Checkbox
            aria-describedby={shared ? undefined : `push-alone-${calendar.id}`}
            checked={switches.stamped}
            disabled={!(awake && shared)}
            onChange={(event) => void flip({ stamped: event.target.checked })}
          >
            {t.stamped}
          </Checkbox>
          <div className="flex flex-col gap-1">
            <Checkbox
              aria-describedby={`push-changed-${calendar.id}${shared ? "" : ` push-alone-${calendar.id}`}`}
              checked={switches.changed}
              disabled={!(awake && shared)}
              onChange={(event) => void flip({ changed: event.target.checked })}
            >
              {t.changed}
            </Checkbox>
            {/* Under the words, past the box. */}
            <p
              className="pl-7.5 text-muted text-xs"
              id={`push-changed-${calendar.id}`}
            >
              {t.changedHint}
            </p>
            {!shared && (
              <p
                className="pl-7.5 font-medium text-muted text-xs"
                id={`push-alone-${calendar.id}`}
              >
                {t.alone}
              </p>
            )}
          </div>
          {switches.reminder && (
            <Field
              className="mt-1 max-w-56 animate-fade"
              disabled={!awake}
              hint={t.timeHint}
              label={t.time}
              max="23:45"
              onBlur={(event) => void keepTime(event.target.value)}
              onChange={(event) => {
                const { value } = event.target;
                setTime(value);
                // Kept a moment after the last turn of the picker.
                clearTimeout(timer.current);
                timer.current = setTimeout(() => void keepTime(value), 1200);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              required
              type="time"
              value={time ?? state.reminderAt}
            />
          )}
          <Button
            className="self-start"
            disabled={!awake}
            onClick={() => void disable()}
            size="sm"
            variant="ghost"
          >
            {t.disable}
          </Button>
        </>
      )}
      {!online && (device === "on" || device === "off") && (
        <Notice>{t.offline}</Notice>
      )}
      {failed && <Notice tone="error">{t.failed}</Notice>}
    </div>
  );
};
