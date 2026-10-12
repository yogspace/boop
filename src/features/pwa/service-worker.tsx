"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js) – what makes Boop installable
 * and open without a connection. Not during development, where a cached page
 * would hide changes (unless NEXT_PUBLIC_SW_DEV=1, to try offline locally).
 */
export const ServiceWorker = () => {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const wanted =
      process.env.NODE_ENV === "production" ||
      process.env.NEXT_PUBLIC_SW_DEV === "1";
    if (wanted) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    } else {
      // A worker left from a production test would serve old pages.
      void navigator.serviceWorker.getRegistrations().then((all) => {
        for (const registration of all) void registration.unregister();
      });
    }
  }, []);
  return null;
};
