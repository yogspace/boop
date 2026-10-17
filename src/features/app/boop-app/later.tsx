"use client";

import { type ComponentType, useEffect, useState } from "react";

/**
 * A part of the app that loads when it is wanted, not with the page – a
 * sheet, the editor. `preload` fetches it ahead (in a quiet moment after the
 * app shows, or as a pointer comes to what opens it), so that by the time it
 * opens it is there, and shows at once. Wanted before, it is nothing until
 * its file came, and then comes as it would have: inside an
 * `AnimatePresence`, its sheet slides in and out as before.
 *
 * No `lazy` and `Suspense` for this: React reveals what waited on them only
 * after a pause (300ms) – a sheet would lag behind the tap.
 *
 * Offline its file comes from the service worker (public/sw.js keeps every
 * file the app may load). Should it not be there all the same, the part
 * stays away – the app goes on – and tries anew the next time it opens.
 */
export const later = <P extends object>(
  load: () => Promise<ComponentType<P>>
) => {
  let loading: Promise<ComponentType<P>> | null = null;
  let loaded: ComponentType<P> | null = null;
  const preload = () => {
    loading ??= load().then(
      (part) => {
        loaded = part;
        return part;
      },
      (error: unknown) => {
        loading = null;
        throw error;
      }
    );
    return loading;
  };
  const Later = (props: P) => {
    const [Part, setPart] = useState(() => loaded);
    useEffect(() => {
      if (Part) return;
      let here = true;
      preload().then(
        (part) => {
          if (here) setPart(() => part);
        },
        () => {
          // Not there – it stays away.
        }
      );
      return () => {
        here = false;
      };
    }, [Part]);
    return Part ? <Part {...props} /> : null;
  };
  return Object.assign(Later, { preload });
};

/** What a part's `preload` is – to fetch several ahead at once (`ahead`). */
type Preloadable = { preload: () => Promise<unknown> };

/**
 * Fetches parts ahead – quietly: one that can't load now loads when it is
 * wanted. A handler as it is (`onPointerEnter={ahead(…)}`).
 */
export const ahead =
  (...parts: Preloadable[]) =>
  () => {
    for (const part of parts) part.preload().catch(() => undefined);
  };

/**
 * Once the browser has a moment to spare – `requestIdleCallback`, or a
 * little while where there is none (Safari). Returns the way to call it
 * off.
 */
export const whenIdle = (work: () => void) => {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(work, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const timer = setTimeout(work, 1200);
  return () => clearTimeout(timer);
};
