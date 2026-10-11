import type { Access, PayloadRequest } from "payload";

/**
 * Who may do what. Two kinds of login share Payload's auth: the admins
 * (`users`, the CMS) and the people using Boop (`accounts`). These helpers
 * tell them apart – every collection's access builds on them.
 */

/** Someone logged in to the admin. */
export const isAdmin = (req: Pick<PayloadRequest, "user">) =>
  req.user?.collection === "users";

/** The account logged in on the site, if any. */
export const accountOf = (req: Pick<PayloadRequest, "user">) =>
  req.user?.collection === "accounts" ? req.user : null;

/** Admins only. A plain boolean, so it also serves `access.admin`. */
export const adminOnly: Access = ({ req }) => isAdmin(req);

/** Admins and logged-in accounts. */
export const signedIn: Access = ({ req }) =>
  isAdmin(req) || Boolean(accountOf(req));

/** Anyone – e.g. signing up. */
export const anyone: Access = () => true;
