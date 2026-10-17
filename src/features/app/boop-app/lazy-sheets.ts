import { ahead, later } from "./later";

/**
 * The sheets the app opens now and then – each a file of its own, loaded
 * when it is first wanted (later.tsx), not with the page: the editor above
 * all, the largest part of the app. The start needs none of them, and
 * shows sooner without.
 *
 * Fetched ahead all the same (`preloadSheets`, `ahead`): once the app
 * shows, in its first quiet moment – and as a pointer or the focus comes to
 * what opens them. By the time one opens, it is there.
 */

export const StampDrawer = later(() =>
  import("../stamp-drawer").then((file) => file.StampDrawer)
);
export const StampSheet = later(() =>
  import("../stamp-sheet").then((file) => file.StampSheet)
);
export const AccountSheet = later(() =>
  import("../account-sheet").then((file) => file.AccountSheet)
);
export const CalendarSettings = later(() =>
  import("../calendar-settings").then((file) => file.CalendarSettings)
);
export const ShareSheet = later(() =>
  import("../share-sheet").then((file) => file.ShareSheet)
);
export const CalendarSheet = later(() =>
  import("../dialogs").then((file) => file.CalendarSheet)
);
export const ConfirmSheet = later(() =>
  import("../dialogs").then((file) => file.ConfirmSheet)
);

/**
 * The popups over the app – an invitation, a stamp that came. Always there,
 * though seldom showing: fetched from the start, while the device's copy
 * opens, so they are in before the app shows.
 */
export const Invitations = later(() =>
  import("../invitations").then((file) => file.Invitations)
);
export const Arrivals = later(() =>
  import("../gifts").then((file) => file.Arrivals)
);

/** The popups, fetched from the start (BoopApp). */
export const preloadPopups = ahead(Invitations, Arrivals);

/** Every sheet, fetched in the app's first quiet moment (BoopApp). */
export const preloadSheets = ahead(
  StampDrawer,
  StampSheet,
  AccountSheet,
  CalendarSettings,
  ShareSheet,
  CalendarSheet,
  ConfirmSheet
);
