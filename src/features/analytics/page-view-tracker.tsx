"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { pageOf, trackView } from "./client";

/**
 * Sends a page view on every route change – mounted once in the frontend
 * layout. Renders nothing.
 *
 * Only the page counts: a change of query or hash is the same page, and so
 * is another calendar in the app (/de/app/{id} is /de/app – client.ts). The
 * last page is remembered so React's double effect in development (strict
 * mode) does not count a page twice. Offline, the view is skipped – not
 * queued (client.ts).
 */
export const PageViewTracker = () => {
  const pathname = usePathname();
  const page = pathname ? pageOf(pathname) : null;
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!page || last.current === page) return;
    // The first page brings the real referrer; every later one was reached
    // from within the site, which the server files as “internal”.
    const ref =
      last.current === null ? document.referrer : window.location.origin;
    last.current = page;
    trackView(page, ref);
  }, [page]);

  return null;
};
