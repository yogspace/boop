"use client";

import { useLayoutEffect } from "react";
import { SIGNED_IN_COOKIE } from "./cookie";

/** Is the login's hint there – right now, on this device? */
const signedIn = () =>
  document.cookie.split("; ").some((c) => c.startsWith(`${SIGNED_IN_COOKIE}=`));

const mark = () =>
  document.documentElement.toggleAttribute("data-in", signedIn());

/**
 * Keeps the document's “logged in” mark (signed-in.ts) once React is there.
 * The script in the head sets it before the first paint – but changing the
 * language builds the document's frame anew (another [locale]), and React
 * takes <html> over with only the attributes it knows: the mark was gone,
 * and the page showed the ways to log in until a reload. So it is set again
 * whenever this frame mounts – before the paint – and when the page comes
 * back to the front (logged in or out in another tab meanwhile).
 */
export const SignedInMark = () => {
  useLayoutEffect(() => {
    mark();
    const onShow = () => {
      if (document.visibilityState === "visible") mark();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", mark);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pageshow", mark);
    };
  }, []);
  return null;
};
