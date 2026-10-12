import type { Access, PayloadRequest } from "payload";

/**
 * Who may do what. Two kinds of login share Payload's auth: the admins
 * (`users`, the CMS) and the people using Boop (`accounts`). These helpers
 * tell them apart – every collection's access builds on them.
 *
 * The CMS is there to run Boop – settings, the legal text, the statistics,
 * looking after accounts – not to read what people keep in it. What they
 * made (calendars, stamps, prints, notes, invitations, their notification
 * devices) is therefore closed over REST for admins too (`sealed`). The app
 * reaches it through its own server code – the sync, the member and
 * invitation endpoints, hooks, crons – which checks the account itself and
 * then reads and writes with `overrideAccess`.
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

/** Anyone – e.g. reading the legal text. */
export const anyone: Access = () => true;

/** Anyone but an admin – signing up: the CMS makes no accounts. */
export const visitors: Access = ({ req }) => !isAdmin(req);

/**
 * Nobody – no admin either. Only server code gets through, with
 * `overrideAccess`.
 */
export const nobody: Access = () => false;

/**
 * Support mode: `ADMIN_SUPPORT=1` in the server's environment. Set by hand
 * for the one case that needs a look into someone's content – finding a
 * bug, answering a request for their data – and taken out again after. Off
 * in normal running; asked anew at every request.
 */
export const supportMode = () => process.env.ADMIN_SUPPORT === "1";

/** Admins – in support mode only. */
export const inSupport: Access = ({ req }) => supportMode() && isAdmin(req);

/**
 * The access of what people made: nobody writes it over REST, and an admin
 * reads it in support mode only.
 */
export const sealed = {
  read: inSupport,
  create: nobody,
  update: nobody,
  delete: nobody,
} satisfies Record<string, Access>;

/** Their `admin.hidden`: out of the admin's navigation and pages, too. */
export const hiddenUnlessSupport = () => !supportMode();
