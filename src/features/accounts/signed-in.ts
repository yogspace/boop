import { SIGNED_IN_COOKIE } from "./cookie";

/**
 * The public pages know whether someone is logged in on this device – by
 * the login's visible hint (cookie.ts, `SIGNED_IN_COOKIE`). They are built
 * ahead and the same for everyone, so they can't ask the server: a line of
 * script in the head marks the document (`data-in` on <html>) before the
 * first paint, and the classes below show one set of buttons or the other.
 * Nothing jumps, offline too.
 */
export const SIGNED_IN_SCRIPT = `document.cookie.split("; ").some(function(c){return c.indexOf("${SIGNED_IN_COOKIE}=")===0})&&document.documentElement.setAttribute("data-in","")`;

/** Shown to whoever is logged in on this device. */
export const ONLY_SIGNED_IN = "hidden [[data-in]_&]:inline-flex";

/** Shown to whoever is not – the ways to log in and sign up. */
export const ONLY_SIGNED_OUT = "[[data-in]_&]:hidden";
