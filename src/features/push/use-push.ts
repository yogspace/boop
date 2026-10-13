"use client";

import { useEffect, useState } from "react";
import {
  type Device,
  deviceState,
  knownPush,
  loadPush,
  type PushPatch,
  savePush,
} from "./client";
import type { PushState } from "./endpoints";

/**
 * What the settings show of the notifications – a calendar's
 * (notification-settings.tsx) and the account's own
 * (account-notifications.tsx) alike: where this device stands, and the
 * account's settings as last heard from the server – asked again whenever
 * there is a connection, left as they are without one.
 *
 * `save` changes one of them: shown at once (`change`), and back to what
 * the server last said, should it say no – `failed` then, for a word about
 * it.
 */
export const usePush = (online: boolean) => {
  const [state, setState] = useState<PushState | null>(knownPush);
  const [device, setDevice] = useState<Device | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void deviceState().then((next) => live && setDevice(next));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!online) return;
    let live = true;
    loadPush()
      .then((next) => live && setState(next))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [online]);

  const save = async (
    patch: PushPatch,
    /** The settings with the change in them – shown until the answer. */
    change: (now: PushState) => PushState
  ) => {
    setFailed(false);
    setState((now) => now && change(now));
    try {
      setState(await savePush(patch));
    } catch {
      setState(knownPush());
      setFailed(true);
    }
  };

  return { state, device, setDevice, failed, setFailed, save };
};
