"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { trackView } from "./client";

/**
 * Sends a page view on every route change – mounted once in the frontend
 * layout. Renders nothing.
 *
 * Only the pathname counts: a change of query or hash is the same page. The
 * last path is remembered so React's double effect in development (strict
 * mode) does not count a page twice.
 */
export const PageViewTracker = () => {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || last.current === pathname) return;
    // The first page brings the real referrer; every later one was reached
    // from within the site, which the server files as “internal”.
    const ref =
      last.current === null ? document.referrer : window.location.origin;
    last.current = pathname;
    trackView(pathname, ref);
  }, [pathname]);

  return null;
};
