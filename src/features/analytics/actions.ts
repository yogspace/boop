/**
 * The actions the statistics count – one list for the beacon (client.ts), the
 * route that stores them, the admin and the mail report. Import-free, so the
 * browser can use it too.
 */
const ACTIONS = {
  "account-created": { en: "Accounts created", de: "Konten angelegt" },
  "account-verified": { en: "Accounts verified", de: "Konten bestätigt" },
  login: { en: "Logins", de: "Anmeldungen" },
  logout: { en: "Logouts", de: "Abmeldungen" },
  "password-reset-requested": {
    en: "Password resets requested",
    de: "Passwort-Resets angefordert",
  },
  "password-reset": { en: "Passwords reset", de: "Passwörter zurückgesetzt" },
  "calendar-created": { en: "Calendars created", de: "Kalender erstellt" },
  "calendar-shared": { en: "Calendars shared", de: "Kalender geteilt" },
  "day-opened": { en: "Days opened", de: "Tage geöffnet" },
  "stamp-created": { en: "Stamps drawn", de: "Stempel gezeichnet" },
  "stamp-placed": { en: "Stamps placed", de: "Stempel gesetzt" },
  "card-created": { en: "Cards sent", de: "Karten verschickt" },
  "card-taken": { en: "Cards taken", de: "Karten übernommen" },
  "export-table": { en: "Exported as table", de: "Als Tabelle exportiert" },
  "export-image": { en: "Exported as picture", de: "Als Bild exportiert" },
} as const;

export type ActionName = keyof typeof ACTIONS;

export type Lang = "de" | "en";

export const ACTION_NAMES = Object.keys(ACTIONS) as ActionName[];

export const isActionName = (value: unknown): value is ActionName =>
  typeof value === "string" && Object.hasOwn(ACTIONS, value);

/** “Stamps placed” – the name itself for anything unknown (older rows). */
export const actionLabel = (name: string, lang: Lang = "en") =>
  isActionName(name) ? ACTIONS[name][lang] : name;

/**
 * The actions by what they are about – for the admin's “What people did” and
 * the mail report alike. Anything not listed here lands in “Other”.
 */
export const ACTION_GROUPS: {
  title: Record<Lang, string>;
  names: ActionName[];
}[] = [
  {
    title: { en: "Accounts", de: "Konten" },
    names: [
      "account-created",
      "account-verified",
      "login",
      "logout",
      "password-reset-requested",
      "password-reset",
    ],
  },
  {
    title: { en: "Calendars", de: "Kalender" },
    names: ["calendar-created", "calendar-shared", "day-opened"],
  },
  {
    title: { en: "Stamps", de: "Stempel" },
    names: ["stamp-created", "stamp-placed", "card-created", "card-taken"],
  },
  {
    title: { en: "Export", de: "Export" },
    names: ["export-table", "export-image"],
  },
];

/**
 * Sorts names into the groups, in each group's fixed order – only the names
 * given, groups without any left out. Unknown names (older rows) go last,
 * under “Other”.
 */
export const groupActions = <T extends string>(
  names: readonly T[],
  lang: Lang = "en"
): { title: string; names: T[] }[] => {
  const present = new Set<string>(names);
  const grouped = new Set<string>(ACTION_GROUPS.flatMap((g) => g.names));
  return [
    ...ACTION_GROUPS.map((group) => ({
      title: group.title[lang],
      names: group.names.filter((name) => present.has(name)) as string[] as T[],
    })),
    {
      title: lang === "de" ? "Weitere" : "Other",
      names: names.filter((name) => !grouped.has(name)),
    },
  ].filter((group) => group.names.length > 0);
};
