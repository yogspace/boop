import { describe, expect, it } from "vitest";
import { accountExport, exportName } from "../../src/features/accounts/export";

const ME = "acc-me";
const ANNA = "acc-anna";
const BEN = "acc-ben";
const NOW = new Date("2026-10-12T10:00:00.000Z");

/** The account as the database has it – with all it must never give out. */
const account = {
  id: ME,
  name: "Max",
  email: "max@example.com",
  locale: "de",
  _verified: true,
  _verificationToken: "verify-token-secret",
  hash: "hash-secret",
  salt: "salt-secret",
  resetPasswordToken: "reset-token-secret",
  resetPasswordExpiration: "2026-10-12T11:00:00.000Z",
  loginAttempts: 2,
  lockUntil: null,
  sessions: [
    {
      id: "session-id-secret",
      createdAt: "2026-10-01T08:00:00.000Z",
      expiresAt: "2026-10-31T08:00:00.000Z",
    },
  ],
  createdAt: "2026-01-05T12:00:00.000Z",
  updatedAt: "2026-10-01T08:00:00.000Z",
  lastSeenAt: "2026-10-11T18:00:00.000Z",
};

const calendars = [
  {
    id: "cal-mine",
    name: "Mein Kalender",
    color: "coral",
    owner: ME,
    members: [ME, ANNA],
    changedAt: "2026-09-01T08:00:00.000Z",
    createdAt: "2026-01-05T12:00:00.000Z",
    deleted: false,
  },
  {
    id: "cal-annas",
    name: "Annas Familie",
    color: "sky",
    // Populated, as a relationship comes with depth.
    owner: { id: ANNA, name: "Anna", email: "anna@example.com" },
    members: [ANNA, ME, BEN],
    deleted: false,
  },
  { id: "cal-gone", name: "–", owner: ME, members: [ME], deleted: true },
  // Not a member: none of its business, should it ever be passed in.
  { id: "cal-foreign", name: "Geheim", owner: BEN, members: [BEN] },
];

const stamps = [
  {
    id: "stamp-mine",
    name: "Herz",
    color: "red",
    shape: "circle",
    drawing: { v: 1, strokes: [{ w: 0.05, p: [0.1, 0.1, 0.9, 0.9] }] },
    owner: ME,
    sharedWith: ["cal-mine"],
    changedAt: "2026-09-02T08:00:00.000Z",
    deleted: false,
  },
  { id: "stamp-gone", name: "", drawing: null, owner: ME, deleted: true },
  {
    id: "stamp-annas",
    name: "Annas Wolke",
    drawing: { v: 1, strokes: [{ w: 0.05, p: [0.2, 0.2, 0.3, 0.3] }] },
    owner: ANNA,
    sharedWith: ["cal-annas"],
    deleted: false,
  },
];

const placements = [
  {
    id: "print-mine",
    calendar: "cal-annas",
    date: "2026-10-11",
    stamp: "stamp-annas",
    x: 0.4,
    y: 0.6,
    rotation: 12,
    scale: 1,
    z: 3,
    ink: "mint",
    placedBy: ME,
    changedAt: "2026-10-11T18:00:00.000Z",
    deleted: false,
  },
  { id: "print-gone", calendar: "cal-mine", placedBy: ME, deleted: true },
  // Anna's print in my calendar – hers, not mine.
  {
    id: "print-annas",
    calendar: "cal-mine",
    date: "2026-10-10",
    stamp: "stamp-annas",
    placedBy: ANNA,
    deleted: false,
  },
];

const invites = [
  {
    id: "inv-open",
    email: "neu@example.com",
    calendar: "cal-mine",
    invitedBy: ME,
    token: "invite-token-secret",
    createdAt: "2026-10-10T10:00:00.000Z",
    expiresAt: "2026-10-24T10:00:00.000Z",
  },
  {
    id: "inv-over",
    email: "alt@example.com",
    calendar: "cal-mine",
    invitedBy: ME,
    token: "old-token-secret",
    createdAt: "2026-09-01T10:00:00.000Z",
    expiresAt: "2026-09-15T10:00:00.000Z",
  },
  {
    id: "inv-annas",
    email: "fremd@example.com",
    calendar: "cal-annas",
    invitedBy: ANNA,
    token: "annas-token-secret",
    createdAt: "2026-10-10T10:00:00.000Z",
    expiresAt: "2026-10-24T10:00:00.000Z",
  },
];

const people = { [ME]: "Max", [ANNA]: "Anna", [BEN]: "Ben" };

const data = accountExport({
  account,
  calendars,
  stamps,
  placements,
  invites,
  people,
  now: NOW,
});
const file = JSON.stringify(data);

describe("the account's data as a file", () => {
  it("says who the account is – and when it was exported", () => {
    expect(data.exportedAt).toBe(NOW.toISOString());
    expect(data.account).toEqual({
      id: ME,
      name: "Max",
      email: "max@example.com",
      locale: "de",
      verified: true,
      createdAt: "2026-01-05T12:00:00.000Z",
      updatedAt: "2026-10-01T08:00:00.000Z",
      lastSeenAt: "2026-10-11T18:00:00.000Z",
      deletionWarnedAt: null,
      logins: [
        {
          since: "2026-10-01T08:00:00.000Z",
          until: "2026-10-31T08:00:00.000Z",
        },
      ],
      failedLogins: 2,
      lockedUntil: null,
    });
  });

  it("never holds a password hash, a token or a session id", () => {
    expect(file).not.toMatch(/secret/);
    for (const key of [
      "hash",
      "salt",
      "token",
      "resetPasswordToken",
      "_verificationToken",
      "sessions",
      "resetPasswordExpiration",
    ]) {
      expect(file).not.toContain(`"${key}"`);
    }
  });

  it("has its own calendars with their members, by name", () => {
    expect(data.calendars).toEqual([
      {
        id: "cal-mine",
        name: "Mein Kalender",
        color: "coral",
        createdAt: "2026-01-05T12:00:00.000Z",
        changedAt: "2026-09-01T08:00:00.000Z",
        members: [
          { id: ME, name: "Max" },
          { id: ANNA, name: "Anna" },
        ],
      },
    ]);
  });

  it("names the calendars of others it is in – and whose they are", () => {
    expect(data.memberships).toEqual([
      {
        id: "cal-annas",
        name: "Annas Familie",
        color: "sky",
        owner: { id: ANNA, name: "Anna" },
      },
    ]);
  });

  it("has its own stamps, drawing and all", () => {
    expect(data.stamps.map((stamp) => stamp.id)).toEqual(["stamp-mine"]);
    expect(data.stamps[0]).toMatchObject({
      name: "Herz",
      color: "red",
      shape: "circle",
      drawing: stamps[0].drawing,
      sharedWith: ["cal-mine"],
    });
  });

  it("has the prints it made, wherever – not the ones others made", () => {
    expect(data.placements).toEqual([
      {
        id: "print-mine",
        calendar: "cal-annas",
        date: "2026-10-11",
        stamp: "stamp-annas",
        x: 0.4,
        y: 0.6,
        rotation: 12,
        scale: 1,
        z: 3,
        ink: "mint",
        createdAt: null,
        changedAt: "2026-10-11T18:00:00.000Z",
      },
    ]);
  });

  it("lists the invitations it sent that are still open", () => {
    expect(data.invites).toEqual([
      {
        email: "neu@example.com",
        calendar: "cal-mine",
        sentAt: "2026-10-10T10:00:00.000Z",
        expiresAt: "2026-10-24T10:00:00.000Z",
      },
    ]);
  });

  it("tells nothing about others but their names", () => {
    // Not their addresses, their doodles, their prints or invitations.
    for (const theirs of [
      "anna@example.com",
      "fremd@example.com",
      "Annas Wolke",
      "print-annas",
      "inv-annas",
      "cal-foreign",
      "Geheim",
    ]) {
      expect(file).not.toContain(theirs);
    }
    // Ben is in Anna's calendar – no business of this file.
    expect(file).not.toContain("Ben");
  });

  it("leaves out what is deleted", () => {
    for (const gone of ["cal-gone", "stamp-gone", "print-gone", "inv-over"]) {
      expect(file).not.toContain(gone);
    }
    expect(file).not.toContain("alt@example.com");
  });

  it("is an empty shelf for an account that has made nothing yet", () => {
    const fresh = accountExport({
      account: { id: "new", name: "Neu", email: "neu@example.com" },
      calendars: [],
      stamps: [],
      placements: [],
      invites: [],
      people: {},
      now: NOW,
    });
    expect(fresh.account.verified).toBe(false);
    expect(fresh.account.logins).toEqual([]);
    expect(fresh.account.failedLogins).toBe(0);
    expect([
      fresh.calendars,
      fresh.memberships,
      fresh.stamps,
      fresh.placements,
      fresh.invites,
    ]).toEqual([[], [], [], [], []]);
  });

  it("is named by the day", () => {
    expect(exportName(NOW)).toBe("boop-2026-10-12.json");
  });
});
