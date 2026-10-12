import { describe, expect, it } from "vitest";
import {
  calendarUrl,
  cleanReminderAt,
  createThrottle,
  isPushEndpoint,
  isPushKey,
  localClock,
  loginLasts,
  minutesOf,
  openCalendars,
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
  it("are both on for a calendar nothing was said about", () => {
    expect(switchesOf(null, FAMILY)).toEqual({ reminder: true, stamped: true });
    expect(
      switchesOf({ calendars: [{ calendar: SPORT, reminder: false }] }, FAMILY)
    ).toEqual({ reminder: true, stamped: true });
  });

  it("read what was switched off – populated or not", () => {
    expect(
      switchesOf(
        { calendars: [{ calendar: { id: FAMILY }, stamped: false }] },
        FAMILY
      )
    ).toEqual({ reminder: true, stamped: false });
  });

  const mine = new Set([FAMILY, SPORT]);

  it("keep only what is off – back on, the entry goes", () => {
    const off = withSwitch(null, mine, { calendar: FAMILY, stamped: false });
    expect(off).toEqual([{ calendar: FAMILY, reminder: true, stamped: false }]);
    const other = withSwitch({ calendars: off }, mine, {
      calendar: FAMILY,
      reminder: false,
    });
    expect(other).toEqual([
      { calendar: FAMILY, reminder: false, stamped: false },
    ]);
    const on = withSwitch({ calendars: other }, mine, {
      calendar: FAMILY,
      reminder: true,
      stamped: true,
    });
    expect(on).toEqual([]);
  });

  it("forget calendars the account is no longer in", () => {
    const before = {
      calendars: [
        { calendar: TRIP, reminder: false, stamped: false },
        { calendar: SPORT, reminder: false, stamped: true },
      ],
    };
    expect(withSwitch(before, mine)).toEqual([
      { calendar: SPORT, reminder: false, stamped: true },
    ]);
    // A switch for one of them changes nothing.
    expect(
      withSwitch(before, mine, { calendar: TRIP, reminder: true })
    ).toEqual([{ calendar: SPORT, reminder: false, stamped: true }]);
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

  it("those without a print of the account today, with the reminder on", () => {
    expect(
      openCalendars({
        calendars,
        settings: { calendars: [{ calendar: TRIP, reminder: false }] },
        stamped: new Set([FAMILY]),
      }).map((c) => c.name)
    ).toEqual(["Sport"]);
  });

  it("none when everything has its print", () => {
    expect(
      openCalendars({
        calendars,
        settings: null,
        stamped: new Set([FAMILY, SPORT, TRIP]),
      })
    ).toEqual([]);
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
