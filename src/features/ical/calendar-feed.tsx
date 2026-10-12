"use client";

import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "valtio";
import { Bang } from "@/components/doodles";
import { Button, buttonClass, Notice } from "@/components/ui";
import type { CalendarDoc } from "@/features/calendar/model";
import { useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import {
  createFeed,
  fetchCalendarFile,
  knownFeed,
  loadFeed,
  renewFeed,
  revokeFeed,
  webcalOf,
} from "./client";
import type { FeedState } from "./endpoints";

/**
 * A calendar in a calendar app, under “Just for you” in its settings: one's
 * own private address to subscribe to – made here and shown again whenever
 * the settings open; copied, opened in the calendar app (`webcal://`),
 * replaced by a new one (asked once: the old one stops working) or taken
 * back. And the calendar once, as a file.
 *
 * The address is a key – whoever has it reads along – and the sheet says
 * so, right under it.
 *
 * All of it is the server's (endpoints.ts): without a connection the
 * buttons sleep, with a word why. An address heard of before still shows,
 * and can be copied.
 */
export const CalendarFeed = ({
  calendar,
  locale,
}: {
  calendar: Snapshot<CalendarDoc>;
  locale: Locale;
}) => {
  const t = dictionaryOf(locale).app;
  const text = t.ical;
  const { me, online } = useBoop();
  const account = me?.id ?? "";
  const [state, setState] = useState<FeedState | null>(() =>
    knownFeed(account, calendar.id)
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Asked once before a new address takes the old one's place.
  const [asked, setAsked] = useState(false);
  const [copied, setCopied] = useState(false);
  const address = useRef<HTMLParagraphElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!(online && account)) return;
    let live = true;
    loadFeed(account, calendar.id)
      .then((next) => live && setState(next))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [online, account, calendar.id]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const awake = online && Boolean(account) && !busy;

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

  const create = () =>
    attempt(async () => setState(await createFeed(account, calendar.id)));

  const renew = () =>
    attempt(async () => {
      setState(await renewFeed(account, calendar.id));
      setAsked(false);
    });

  const revoke = () =>
    attempt(async () => setState(await revokeFeed(account, calendar.id)));

  const copy = async () => {
    if (!state?.url) return;
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard here (no permission, an old browser): marked instead,
      // a ⌘C away.
      if (address.current) {
        window.getSelection()?.selectAllChildren(address.current);
      }
    }
  };

  const download = () =>
    attempt(async () => {
      const file = await fetchCalendarFile(calendar.id);
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

  const fetched = state?.lastFetchedAt
    ? `${text.fetched} ${new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
      }).format(new Date(state.lastFetchedAt))}`
    : text.neverFetched;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="font-bold text-sm">{text.title}</p>
        <p className="font-medium text-muted text-sm">{text.text}</p>
      </div>
      {state?.url && (
        <div className="flex animate-fade flex-col gap-3">
          <div className="flex flex-col gap-2">
            <p className="font-bold text-sm">{text.address}</p>
            {/* All of it, on as many lines as it takes – and marked whole
                with one tap, to copy by hand. */}
            <p
              className="scribble scribble-thin scribble-dashed select-all break-all rounded-2xl px-4 py-3 font-medium text-sm"
              ref={address}
            >
              {state.url}
            </p>
            <p className="text-muted text-xs">{fetched}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void copy()} size="sm" variant="plain">
              {copied ? text.copied : text.copy}
            </Button>
            {/* A link, so the calendar app takes it – asleep offline: the
                app couldn't fetch it either. */}
            <a
              aria-disabled={!online}
              className={cn(
                buttonClass({ size: "sm", variant: "plain" }),
                !online && "pointer-events-none opacity-40"
              )}
              href={webcalOf(state.url)}
              tabIndex={online ? undefined : -1}
            >
              {text.open}
            </a>
          </div>
          <Notice>{text.warning}</Notice>
          {asked ? (
            // Watch out: a thick frame and an exclamation mark. The frames
            // inside keep their own line – a frame's width is handed down.
            <div className="scribble scribble-bold rounded-2xl">
              <div className="flex animate-fade flex-col gap-3 p-4 [--scribble-width:3px]">
                <p className="flex items-start gap-2.5 font-bold">
                  <Bang className="h-6 w-6 shrink-0" />
                  <span className="wrap-break-word min-w-0">
                    {text.renewAsk}
                  </span>
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => setAsked(false)}
                    size="sm"
                    variant="ghost"
                  >
                    {t.draw.cancel}
                  </Button>
                  <Button
                    disabled={!awake}
                    onClick={() => void renew()}
                    size="sm"
                    variant="danger"
                  >
                    {text.renewYes}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!awake}
                onClick={() => setAsked(true)}
                size="sm"
                variant="ghost"
              >
                {text.renew}
              </Button>
              <Button
                disabled={!awake}
                onClick={() => void revoke()}
                size="sm"
                variant="ghost"
              >
                {text.revoke}
              </Button>
            </div>
          )}
        </div>
      )}
      {/* None yet – as far as the server said: unheard, nothing to offer. */}
      {state && !state.url && (
        <Button
          className="self-start"
          disabled={!awake}
          onClick={() => void create()}
          size="sm"
          variant="plain"
        >
          {text.create}
        </Button>
      )}
      <Button
        className="self-start"
        disabled={!awake}
        onClick={() => void download()}
        size="sm"
        variant="ghost"
      >
        {text.download}
      </Button>
      {!online && <Notice>{text.offline}</Notice>}
      {failed && <Notice tone="error">{text.failed}</Notice>}
    </div>
  );
};
