import { describe, expect, it } from "vitest";
import {
  aboutOf,
  type CalendarChange,
  CHANGED_GATHER_MS,
  CHANGED_WINDOW_MS,
  calendarChanges,
  calendarUrl,
  changedMessage,
  changedTargets,
  cleanReminderAt,
  createBundle,
  createThrottle,
  enteredIn,
  isPushEndpoint,
  isPushKey,
  localClock,
  loginLasts,
  minutesOf,
  noteChanges,
  openCalendars,
  placementChanges,
  reminderAtOf,
  reminderDue,
  reminderMessage,
  rowOf,
  STAMPED_WINDOW_MS,
  type SubscriptionRow,
  secondsLeftOfDay,
  stampedMessage,
  stampedTargets,
  switchesOf,
  withSwitch,
} from "../../src/features/push/rules";

const ME = "acc-me";
const ANNA = "acc-anna";
const BEN = "acc-ben";
const CARL = "acc-carl";
const FAMILY = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const SPORT = "9a8b7c6d-5e4f-4321-8765-0fedcba98765";
const TRIP = "11111111-2222-4333-8444-555555555555";

// 20:00 in Berlin (summer time, UTC+2) on 12 October 2026.
const EVENING = new Date("2026-10-12T18:00:00.000Z");

const device = (
  id: string,
  account: string,
  more: Partial<SubscriptionRow> = {}
): SubscriptionRow => ({
  id,
  account,
  endpoint: `https://web.push.apple.com/${id}`,
  keys: { p256dh: "key", auth: "auth" },
  session: `${account}-session`,
  timeZone: "Europe/Berlin",
  locale: "de",
  remindedOn: null,
  lastUsedAt: null,
  ...more,
});

const loggedIn = (account: string) => [
  { id: `${account}-session`, expiresAt: "2026-11-01T00:00:00.000Z" },
];

describe("the reminder's time", () => {
  it("reads HH:MM, and nothing else", () => {
    expect(minutesOf("20:00")).toBe(1200);
    expect(minutesOf("00:00")).toBe(0);
    expect(minutesOf("23:59")).toBe(23 * 60 + 59);
    for (const wrong of ["24:00", "7:00", "20:60", "20.00", "", null, 1200]) {
      expect(minutesOf(wrong)).toBeNull();
    }
  });

  it("is kept at 23:45 at the latest – the cron's last round", () => {
    expect(cleanReminderAt("21:30")).toBe("21:30");
    expect(cleanReminderAt("23:45")).toBe("23:45");
    expect(cleanReminderAt("23:50")).toBe("23:45");
    expect(cleanReminderAt("nope")).toBeNull();
  });

  it("is 20:00 unless the account set its own", () => {
    expect(reminderAtOf(null)).toBe("20:00");
    expect(reminderAtOf({ reminderAt: "07:15" })).toBe("07:15");
    expect(reminderAtOf({ reminderAt: "garbage" })).toBe("20:00");
  });
});

describe("the device's clock", () => {
  it("tells day and minute in its zone", () => {
    expect(localClock("Europe/Berlin", EVENING)).toEqual({
      day: "2026-10-12",
      minutes: 20 * 60,
    });
    expect(localClock("America/New_York", EVENING)).toEqual({
      day: "2026-10-12",
      minutes: 14 * 60,
    });
    // Already tomorrow in Tokyo.
    expect(localClock("Asia/Tokyo", EVENING)).toEqual({
      day: "2026-10-13",
      minutes: 3 * 60,
    });
  });

  it("follows the zone into winter time", () => {
    expect(
      localClock("Europe/Berlin", new Date("2026-12-01T19:00:00.000Z"))
    ).toEqual({ day: "2026-12-01", minutes: 20 * 60 });
  });

  it("takes Berlin's for a zone it doesn't know", () => {
    expect(localClock("Mars/Olympus", EVENING)).toEqual(
      localClock("Europe/Berlin", EVENING)
    );
  });

  it("knows how much of the day is left – a reminder lives no longer", () => {
    expect(secondsLeftOfDay("Europe/Berlin", EVENING)).toBe(4 * 60 * 60);
    // A minute at least, just before midnight.
    expect(
      secondsLeftOfDay("Europe/Berlin", new Date("2026-10-12T21:59:50.000Z"))
    ).toBe(60);
  });
});

describe("when a reminder is due", () => {
  const berlin = { timeZone: "Europe/Berlin", remindedOn: null };

  it("is once the time has come on the device's clock", () => {
    const before = new Date("2026-10-12T17:59:00.000Z");
    expect(reminderDue(berlin, "20:00", before)).toBeNull();
    expect(reminderDue(berlin, "20:00", EVENING)).toBe("2026-10-12");
    // Later that evening, too – the cron may have missed a round.
    const late = new Date("2026-10-12T21:30:00.000Z");
    expect(reminderDue(berlin, "20:00", late)).toBe("2026-10-12");
  });

  it("is once a day: not again when one went today", () => {
    const today = { ...berlin, remindedOn: "2026-10-12" };
    expect(reminderDue(today, "20:00", EVENING)).toBeNull();
    const yesterday = { ...berlin, remindedOn: "2026-10-11" };
    expect(reminderDue(yesterday, "20:00", EVENING)).toBe("2026-10-12");
  });

  it("is each device's own evening, wherever it is", () => {
    // 03:00 in Tokyo – long before its evening.
    expect(
      reminderDue(
        { timeZone: "Asia/Tokyo", remindedOn: null },
        "20:00",
        EVENING
      )
    ).toBeNull();
    // 20:00 in Los Angeles is 03:00 the next day in UTC – still the 12th there.
    expect(
      reminderDue(
        { timeZone: "America/Los_Angeles", remindedOn: null },
        "20:00",
        new Date("2026-10-13T03:00:00.000Z")
      )
    ).toBe("2026-10-12");
  });

  it("is not due at a time that isn't one", () => {
    expect(reminderDue(berlin, "late", EVENING)).toBeNull();
  });
});

describe("the switches", () => {
  const DEFAULTS = { reminder: true, stamped: true, changed: false };

  it("are as by default for a calendar nothing was said about", () => {
    expect(switchesOf(null, FAMILY)).toEqual(DEFAULTS);
    expect(
      switchesOf({ calendars: [{ calendar: SPORT, reminder: false }] }, FAMILY)
    ).toEqual(DEFAULTS);
  });

  it("read what was switched – populated or not", () => {
    expect(
      switchesOf(
        { calendars: [{ calendar: { id: FAMILY }, stamped: false }] },
        FAMILY
      )
    ).toEqual({ ...DEFAULTS, stamped: false });
    expect(
      switchesOf({ calendars: [{ calendar: FAMILY, changed: true }] }, FAMILY)
    ).toEqual({ ...DEFAULTS, changed: true });
  });

  it("have “someone changed something” off in entries from before it", () => {
    expect(
      switchesOf(
        { calendars: [{ calendar: FAMILY, reminder: false, stamped: true }] },
        FAMILY
      )
    ).toEqual({ reminder: false, stamped: true, changed: false });
  });

  const mine = new Set([FAMILY, SPORT]);

  it("keep only what differs – back to the defaults, the entry goes", () => {
    const off = withSwitch(null, mine, { calendar: FAMILY, stamped: false });
    expect(off).toEqual([{ calendar: FAMILY, ...DEFAULTS, stamped: false }]);
    const other = withSwitch({ calendars: off }, mine, {
      calendar: FAMILY,
      reminder: false,
    });
    expect(other).toEqual([
      { calendar: FAMILY, reminder: false, stamped: false, changed: false },
    ]);
    const on = withSwitch({ calendars: other }, mine, {
      calendar: FAMILY,
      reminder: true,
      stamped: true,
    });
    expect(on).toEqual([]);
  });

  it("keep the third switch when on, and drop it when off again", () => {
    const on = withSwitch(null, mine, { calendar: SPORT, changed: true });
    expect(on).toEqual([{ calendar: SPORT, ...DEFAULTS, changed: true }]);
    expect(
      withSwitch({ calendars: on }, mine, { calendar: SPORT, changed: false })
    ).toEqual([]);
  });

  it("forget calendars the account is no longer in", () => {
    const before = {
      calendars: [
        { calendar: TRIP, reminder: false, stamped: false },
        { calendar: SPORT, reminder: false, stamped: true },
      ],
    };
    expect(withSwitch(before, mine)).toEqual([
      { calendar: SPORT, reminder: false, stamped: true, changed: false },
    ]);
    // A switch for one of them changes nothing.
    expect(
      withSwitch(before, mine, { calendar: TRIP, reminder: true })
    ).toEqual([
      { calendar: SPORT, reminder: false, stamped: true, changed: false },
    ]);
  });
});

describe("a device's login", () => {
  it("must still be there – logged out, it hears nothing", () => {
    const phone = device("phone", ANNA);
    expect(loginLasts(phone, loggedIn(ANNA), EVENING)).toBe(true);
    expect(loginLasts(phone, [], EVENING)).toBe(false);
    expect(loginLasts(phone, loggedIn(BEN), EVENING)).toBe(false);
  });

  it("must not have run out", () => {
    const phone = device("phone", ANNA);
    const over = [
      { id: `${ANNA}-session`, expiresAt: "2026-10-12T17:00:00.000Z" },
    ];
    expect(loginLasts(phone, over, EVENING)).toBe(false);
  });

  it("counts as there when none was noted", () => {
    expect(
      loginLasts(device("old", ANNA, { session: null }), [], EVENING)
    ).toBe(true);
  });
});

describe("who hears that someone stamped", () => {
  const members = [ME, ANNA, BEN];
  const devices = [
    device("my-phone", ME),
    device("my-laptop", ME),
    device("anna-phone", ANNA),
    device("anna-laptop", ANNA, { locale: "en" }),
    device("anna-old", ANNA, { session: "logged-out" }),
    device("ben-phone", BEN),
    device("carl-phone", CARL),
  ];
  const sessions = {
    [ME]: loggedIn(ME),
    [ANNA]: loggedIn(ANNA),
    [BEN]: loggedIn(BEN),
    [CARL]: loggedIn(CARL),
  };

  it("is the other members' devices – never the stamper's own", () => {
    const targets = stampedTargets({
      calendar: FAMILY,
      members,
      by: ME,
      devices,
      settings: {},
      sessions,
      now: EVENING,
    });
    expect(targets.map((d) => d.id)).toEqual([
      "anna-phone",
      "anna-laptop",
      "ben-phone",
    ]);
  });

  it("leaves out whoever switched it off for this calendar", () => {
    const targets = stampedTargets({
      calendar: FAMILY,
      members,
      by: ME,
      devices,
      settings: {
        [BEN]: { calendars: [{ calendar: FAMILY, stamped: false }] },
        // Off elsewhere – here still on.
        [ANNA]: { calendars: [{ calendar: SPORT, stamped: false }] },
      },
      sessions,
      now: EVENING,
    });
    expect(targets.map((d) => d.id)).toEqual(["anna-phone", "anna-laptop"]);
  });

  it("is nobody in a calendar of one", () => {
    expect(
      stampedTargets({
        calendar: SPORT,
        members: [ME],
        by: ME,
        devices,
        settings: {},
        sessions,
        now: EVENING,
      })
    ).toEqual([]);
  });
});

describe("which calendars a reminder names", () => {
  const calendars = [
    { id: FAMILY, name: "Familie" },
    { id: SPORT, name: "Sport" },
    { id: TRIP, name: "Reise" },
  ];

  it("those without an entry of the account today, with the reminder on", () => {
    expect(
      openCalendars({
        calendars,
        settings: { calendars: [{ calendar: TRIP, reminder: false }] },
        entered: new Set([FAMILY]),
      }).map((c) => c.name)
    ).toEqual(["Sport"]);
  });

  it("none when everything has its entry", () => {
    expect(
      openCalendars({
        calendars,
        settings: null,
        entered: new Set([FAMILY, SPORT, TRIP]),
      })
    ).toEqual([]);
  });
});

describe("what counts as an entry of one's own today", () => {
  const DAY = "2026-10-12";
  const print = (calendar: string, more: Record<string, unknown> = {}) => ({
    calendar,
    date: DAY,
    placedBy: ME,
    deleted: false,
    ...more,
  });
  const note = (calendar: string, more: Record<string, unknown> = {}) => ({
    calendar,
    date: DAY,
    editedBy: ME,
    content: [[{ text: "Zoo" }]],
    deleted: false,
    ...more,
  });
  const entered = (
    prints: Record<string, unknown>[],
    notes: Record<string, unknown>[]
  ) => enteredIn({ account: ME, day: DAY, prints, notes });
  const open = (entries: Set<string>) =>
    openCalendars({
      calendars: [
        { id: FAMILY, name: "Familie" },
        { id: SPORT, name: "Sport" },
      ],
      settings: null,
      entered: entries,
    }).map((c) => c.name);

  it("a print of one's own", () => {
    expect(entered([print(FAMILY)], [])).toEqual(new Set([FAMILY]));
    // Someone else's, another day's, a removed one: not.
    expect(
      entered(
        [
          print(SPORT, { placedBy: ANNA }),
          print(SPORT, { date: "2026-10-11" }),
          print(SPORT, { deleted: true }),
        ],
        []
      )
    ).toEqual(new Set());
  });

  it("only a note – that calendar is not named", () => {
    const entries = entered([], [note(FAMILY)]);
    expect(entries).toEqual(new Set([FAMILY]));
    expect(open(entries)).toEqual(["Sport"]);
  });

  it("a note someone else wrote doesn't count", () => {
    const entries = entered([], [note(FAMILY, { editedBy: ANNA })]);
    expect(entries).toEqual(new Set());
    expect(open(entries)).toEqual(["Familie", "Sport"]);
  });

  it("an emptied note doesn't count", () => {
    expect(
      entered(
        [],
        [note(FAMILY, { deleted: true, content: null, editedBy: null })]
      )
    ).toEqual(new Set());
    // Not even with its writer still on it.
    expect(entered([], [note(FAMILY, { deleted: true })])).toEqual(new Set());
  });

  it("a print here and a note there – nothing open, no reminder", () => {
    const entries = entered(
      [print(FAMILY, { calendar: { id: FAMILY } })],
      [note(SPORT, { editedBy: { id: ME } })]
    );
    expect(open(entries)).toEqual([]);
  });
});

describe("bundling", () => {
  it("lets one notification out per person and calendar in a while", () => {
    const goes = createThrottle(STAMPED_WINDOW_MS);
    const start = 1_000_000;
    expect(goes(`${FAMILY}:${ANNA}`, start)).toBe(true);
    // Her next prints, minutes later – the same notification.
    expect(goes(`${FAMILY}:${ANNA}`, start + 60_000)).toBe(false);
    expect(goes(`${FAMILY}:${ANNA}`, start + STAMPED_WINDOW_MS - 1)).toBe(
      false
    );
    // Someone else, or somewhere else – their own.
    expect(goes(`${FAMILY}:${BEN}`, start + 60_000)).toBe(true);
    expect(goes(`${SPORT}:${ANNA}`, start + 60_000)).toBe(true);
    // A while later – news again.
    expect(goes(`${FAMILY}:${ANNA}`, start + STAMPED_WINDOW_MS)).toBe(true);
  });
});

describe("what a notification says", () => {
  it("names who stamped where – in the device's language", () => {
    expect(
      stampedMessage("de", {
        name: "Anna",
        calendar: { id: FAMILY, name: "Familie" },
      })
    ).toEqual({
      title: "Boop!",
      body: "Anna hat in „Familie“ gestempelt.",
      url: `/de/app/${FAMILY}`,
      tag: `stamped-${FAMILY}`,
    });
    expect(
      stampedMessage("en", {
        name: "",
        calendar: { id: FAMILY, name: "Family" },
      }).body
    ).toBe("Someone stamped in “Family”.");
  });

  it("names the calendars still waiting, and leads to the first", () => {
    const one = reminderMessage("de", [{ id: SPORT, name: "Sport" }]);
    expect(one.body).toBe("„Sport“ wartet noch auf deinen Stempel.");
    expect(one.url).toBe(calendarUrl("de", SPORT));
    expect(one.tag).toBe("reminder");
    expect(
      reminderMessage("de", [
        { id: FAMILY, name: "Familie" },
        { id: SPORT, name: "Sport" },
        { id: TRIP, name: "Reise" },
      ]).body
    ).toBe("„Familie“, „Sport“ und „Reise“ warten noch auf deinen Stempel.");
    expect(
      reminderMessage("en", [
        { id: FAMILY, name: "Family" },
        { id: SPORT, name: "Sport" },
      ]).body
    ).toBe("“Family” and “Sport” are still waiting for your stamp.");
  });

  it("carries nothing but what it shows", () => {
    const message = stampedMessage("de", {
      name: "Anna",
      calendar: { id: FAMILY, name: "Familie" },
    });
    expect(Object.keys(message).sort()).toEqual([
      "body",
      "tag",
      "title",
      "url",
    ]);
    expect(JSON.stringify(message)).not.toContain(ANNA);
  });
});

describe("what counts as a change", () => {
  const lines = (text: string) => [[{ text }]];

  it("a note written, rewritten or emptied – the same words again: no", () => {
    const note = { calendar: FAMILY, content: lines("Zoo"), deleted: false };
    expect(
      noteChanges({ operation: "create", doc: note, previous: {}, by: ANNA })
    ).toEqual([{ kind: "note" }]);
    expect(
      noteChanges({
        operation: "update",
        doc: { ...note, content: lines("Zoo mit Oma") },
        previous: note,
        by: ANNA,
      })
    ).toEqual([{ kind: "note" }]);
    expect(
      noteChanges({ operation: "update", doc: note, previous: note, by: ANNA })
    ).toEqual([]);
    const emptied = { calendar: FAMILY, content: null, deleted: true };
    expect(
      noteChanges({
        operation: "update",
        doc: emptied,
        previous: note,
        by: ANNA,
      })
    ).toEqual([{ kind: "noteDeleted" }]);
    // Written again on an emptied day.
    expect(
      noteChanges({
        operation: "update",
        doc: note,
        previous: emptied,
        by: ANNA,
      })
    ).toEqual([{ kind: "note" }]);
  });

  const print = {
    calendar: FAMILY,
    date: "2026-10-12",
    x: 0.5,
    y: 0.5,
    rotation: 0,
    scale: 1,
    z: 1,
    ink: "coral",
    deleted: false,
  };

  it("a print moved, turned or taken off – not one placed", () => {
    const update = (doc: Record<string, unknown>, previous = print) =>
      placementChanges({ operation: "update", doc, previous, by: ANNA });
    expect(update({ ...print, x: 0.7, z: 2 })).toEqual([{ kind: "moved" }]);
    expect(update({ ...print, rotation: 45 })).toEqual([{ kind: "moved" }]);
    expect(update({ ...print, deleted: true })).toEqual([
      { kind: "unstamped" },
    ]);
    expect(update(print)).toEqual([]);
    // Taken off twice is once.
    expect(update(print, { ...print, deleted: true })).toEqual([]);
    expect(
      placementChanges({
        operation: "create",
        doc: print,
        previous: {},
        by: ANNA,
      })
    ).toEqual([]);
  });

  const calendar = {
    id: FAMILY,
    name: "Familie",
    color: "coral",
    owner: ANNA,
    members: [ANNA, BEN],
    deleted: false,
  };
  const update = (doc: Record<string, unknown>, by = ANNA) =>
    calendarChanges({ operation: "update", doc, previous: calendar, by });

  it("a calendar renamed – its color is no news", () => {
    expect(update({ ...calendar, name: "Familie Weber" })).toEqual([
      { kind: "renamed", from: "Familie" },
    ]);
    expect(update({ ...calendar, color: "mint" })).toEqual([]);
    expect(update({ ...calendar, name: "Weg", deleted: true })).toEqual([]);
  });

  it("someone in, gone by themselves, or taken out", () => {
    expect(update({ ...calendar, members: [ANNA, BEN, CARL] })).toEqual([
      { kind: "joined", who: CARL },
    ]);
    // Populated, too.
    expect(
      update({ ...calendar, members: [{ id: ANNA }, { id: BEN }, { id: ME }] })
    ).toEqual([{ kind: "joined", who: ME }]);
    expect(update({ ...calendar, members: [ANNA] }, BEN)).toEqual([
      { kind: "left", who: BEN },
    ]);
    expect(update({ ...calendar, members: [ANNA] }, ANNA)).toEqual([
      { kind: "removed", who: BEN },
    ]);
  });
});

describe("who hears that someone changed something", () => {
  const members = [ME, ANNA, BEN];
  const on = (...calendars: string[]) => ({
    calendars: calendars.map((calendar) => ({ calendar, changed: true })),
  });
  const devices = [
    device("my-phone", ME),
    device("anna-phone", ANNA),
    device("anna-old", ANNA, { session: "logged-out" }),
    device("ben-phone", BEN),
  ];
  const sessions = {
    [ME]: loggedIn(ME),
    [ANNA]: loggedIn(ANNA),
    [BEN]: loggedIn(BEN),
  };
  const targets = (more: Partial<Parameters<typeof changedTargets>[0]> = {}) =>
    changedTargets({
      calendar: FAMILY,
      members,
      by: ME,
      about: [],
      devices,
      settings: { [ANNA]: on(FAMILY), [BEN]: on(FAMILY) },
      sessions,
      now: EVENING,
      ...more,
    }).map((d) => d.id);

  it("is nobody unless they switched it on – it's off by default", () => {
    expect(targets({ settings: {} })).toEqual([]);
    expect(targets({ settings: { [ANNA]: on(SPORT) } })).toEqual([]);
    expect(targets({ settings: { [BEN]: on(FAMILY) } })).toEqual(["ben-phone"]);
  });

  it("is never the one who did it – none of their devices", () => {
    expect(
      targets({ settings: { [ME]: on(FAMILY), [ANNA]: on(FAMILY) } })
    ).toEqual(["anna-phone"]);
  });

  it("is never whom it is about – one taken out hears nothing of it", () => {
    const removed: CalendarChange[] = [{ kind: "removed", who: BEN }];
    // Even were Ben still listed as a member.
    expect(targets({ about: aboutOf(removed) })).toEqual(["anna-phone"]);
    expect(targets({ members: [ME, ANNA] })).toEqual(["anna-phone"]);
  });
});

describe("bundling changes", () => {
  const KEY = `${FAMILY}:${ANNA}`;
  const START = 1_000_000;
  const note: CalendarChange = { kind: "note" };
  const moved: CalendarChange = { kind: "moved" };

  it("tells the first a moment later – with the rest of its sync", () => {
    const bundle = createBundle(CHANGED_WINDOW_MS, CHANGED_GATHER_MS);
    expect(bundle.add(KEY, note, START)).toBe(START + CHANGED_GATHER_MS);
    // Same sync: joins it, nothing more to schedule.
    expect(bundle.add(KEY, moved, START + 10)).toBeNull();
    expect(bundle.take(KEY, START + CHANGED_GATHER_MS)).toEqual([note, moved]);
  });

  it("lets more of the same pass quietly within the window", () => {
    const bundle = createBundle(CHANGED_WINDOW_MS, CHANGED_GATHER_MS);
    bundle.add(KEY, note, START);
    const told = START + CHANGED_GATHER_MS;
    expect(bundle.take(KEY, told)).toEqual([note]);
    expect(bundle.add(KEY, note, told + 60_000)).toBeNull();
    expect(bundle.take(KEY, told + 60_000)).toBeNull();
    // Once the window is over: news again.
    const later = told + CHANGED_WINDOW_MS;
    expect(bundle.add(KEY, note, later)).toBe(later + CHANGED_GATHER_MS);
  });

  it("tells something new at the window's end – all of it, once", () => {
    const bundle = createBundle(CHANGED_WINDOW_MS, CHANGED_GATHER_MS);
    bundle.add(KEY, note, START);
    const told = START + CHANGED_GATHER_MS;
    bundle.take(KEY, told);
    expect(bundle.add(KEY, moved, told + 60_000)).toBe(
      told + CHANGED_WINDOW_MS
    );
    // Already waiting – nothing more to schedule.
    expect(bundle.add(KEY, { kind: "unstamped" }, told + 120_000)).toBeNull();
    expect(bundle.take(KEY, told + CHANGED_WINDOW_MS)).toEqual([
      note,
      moved,
      { kind: "unstamped" },
    ]);
  });

  it("is one per person and calendar", () => {
    const bundle = createBundle(CHANGED_WINDOW_MS, CHANGED_GATHER_MS);
    bundle.add(KEY, note, START);
    expect(bundle.add(`${FAMILY}:${BEN}`, note, START)).not.toBeNull();
    expect(bundle.add(`${SPORT}:${ANNA}`, note, START)).not.toBeNull();
  });

  it("counts each person who came in as news of their own", () => {
    const bundle = createBundle(CHANGED_WINDOW_MS, CHANGED_GATHER_MS);
    bundle.add(KEY, { kind: "joined", who: BEN }, START);
    const told = START + CHANGED_GATHER_MS;
    bundle.take(KEY, told);
    expect(
      bundle.add(KEY, { kind: "joined", who: BEN }, told + 1000)
    ).toBeNull();
    expect(
      bundle.add(KEY, { kind: "joined", who: CARL }, told + 2000)
    ).not.toBeNull();
  });
});

describe("what a change says", () => {
  const familie = { id: FAMILY, name: "Familie" };
  const say = (
    changes: CalendarChange[],
    locale: "de" | "en" = "de",
    calendar = familie
  ) =>
    changedMessage(locale, {
      name: "Anna",
      calendar,
      changes,
      people: { [BEN]: "Ben" },
    })?.body;

  it("names what was done, in the device's language", () => {
    expect(say([{ kind: "note" }])).toBe(
      "Anna hat in „Familie“ eine Notiz geschrieben."
    );
    expect(say([{ kind: "noteDeleted" }])).toBe(
      "Anna hat in „Familie“ eine Notiz gelöscht."
    );
    expect(say([{ kind: "moved" }])).toBe(
      "Anna hat in „Familie“ Abdrücke verschoben."
    );
    expect(say([{ kind: "unstamped" }])).toBe(
      "Anna hat in „Familie“ Abdrücke entfernt."
    );
    expect(
      say([{ kind: "renamed", from: "Familie" }], "de", {
        id: FAMILY,
        name: "Familie Weber",
      })
    ).toBe("Anna hat „Familie“ in „Familie Weber“ umbenannt.");
    expect(say([{ kind: "note" }], "en", { id: FAMILY, name: "Family" })).toBe(
      "Anna wrote a note in “Family”."
    );
  });

  it("names who came or went", () => {
    expect(say([{ kind: "joined", who: BEN }])).toBe(
      "Ben ist jetzt in „Familie“ dabei."
    );
    expect(say([{ kind: "left", who: BEN }])).toBe(
      "Ben hat „Familie“ verlassen."
    );
    expect(say([{ kind: "removed", who: BEN }])).toBe(
      "Ben ist nicht mehr in „Familie“ dabei."
    );
    expect(say([{ kind: "joined", who: CARL }], "en")).toBe(
      "Someone is in “Familie” now."
    );
  });

  it("says “a few things” for more than one", () => {
    expect(say([{ kind: "note" }, { kind: "moved" }])).toBe(
      "Anna hat in „Familie“ einiges geändert."
    );
    expect(
      say([
        { kind: "joined", who: BEN },
        { kind: "joined", who: CARL },
      ])
    ).toBe("Anna hat in „Familie“ einiges geändert.");
    // The same twice is one.
    expect(say([{ kind: "note" }, { kind: "note" }])).toBe(
      "Anna hat in „Familie“ eine Notiz geschrieben."
    );
  });

  it("says nothing of a name changed and back", () => {
    expect(say([{ kind: "renamed", from: "Familie" }])).toBeUndefined();
    expect(say([{ kind: "renamed", from: "Familie" }, { kind: "note" }])).toBe(
      "Anna hat in „Familie“ eine Notiz geschrieben."
    );
  });

  it("leads to the calendar, replaces the one before, carries no ids", () => {
    const message = changedMessage("de", {
      name: "Anna",
      calendar: familie,
      changes: [{ kind: "joined", who: BEN }],
      people: { [BEN]: "Ben" },
    });
    expect(message).toMatchObject({
      title: "Boop!",
      url: `/de/app/${FAMILY}`,
      tag: `changed-${FAMILY}`,
    });
    expect(JSON.stringify(message)).not.toContain(BEN);
  });
});

describe("a device's address", () => {
  it("is one of the browsers' push services", () => {
    for (const ok of [
      "https://web.push.apple.com/QGuQyavXutnMH",
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
    ]) {
      expect(isPushEndpoint(ok)).toBe(true);
    }
  });

  it("is never anything else – the server would post there", () => {
    for (const wrong of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evil.example/fcm.googleapis.com",
      "https://localhost:3000/api",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://user:pass@fcm.googleapis.com/fcm/send/abc",
      "https://169.254.169.254/latest",
      `https://web.push.apple.com/${"x".repeat(1100)}`,
      "",
      null,
    ]) {
      expect(isPushEndpoint(wrong)).toBe(false);
    }
  });

  it("comes with keys as browsers write them", () => {
    expect(
      isPushKey(
        "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
        200
      )
    ).toBe(true);
    expect(isPushKey("tBHItJI5svbpez7KI4CCXg==", 64)).toBe(true);
    expect(isPushKey("<script>", 64)).toBe(false);
    expect(isPushKey("x".repeat(65), 64)).toBe(false);
  });
});

describe("a device as stored", () => {
  it("is made plain – a zone it doesn't know becomes Berlin", () => {
    expect(
      rowOf({
        id: "d1",
        account: { id: ANNA },
        endpoint: "https://web.push.apple.com/x",
        keys: { p256dh: "p", auth: "a" },
        session: "s",
        timeZone: "Nowhere/Land",
        locale: "fr",
        lastUsedAt: new Date("2026-10-12T00:00:00.000Z"),
      })
    ).toEqual({
      id: "d1",
      account: ANNA,
      endpoint: "https://web.push.apple.com/x",
      keys: { p256dh: "p", auth: "a" },
      session: "s",
      timeZone: "Europe/Berlin",
      locale: "de",
      remindedOn: null,
      lastUsedAt: "2026-10-12T00:00:00.000Z",
    });
  });

  it("is none without its address or keys", () => {
    expect(rowOf({ id: "d2", account: ANNA, endpoint: "x" })).toBeNull();
  });
});
