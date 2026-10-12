import { describe, expect, it } from "vitest";
import {
  expiredInvites,
  INVITE_DAYS,
  inviteEnd,
  inviteExpired,
  inviteExpiresAt,
} from "../../src/features/calendar/invite-expiry";

const DAY = 86_400_000;
const MADE = Date.parse("2026-10-01T09:00:00.000Z");
const iso = (time: number) => new Date(time).toISOString();

/** An invitation as it is made today: `expiresAt` set along. */
const invitation = (made = MADE) => ({
  createdAt: iso(made),
  expiresAt: inviteExpiresAt(made),
});

describe("how long an invitation lasts", () => {
  it("is good for two weeks from when it was sent", () => {
    expect(INVITE_DAYS).toBe(14);
    expect(inviteEnd(invitation())).toEqual(new Date(MADE + 14 * DAY));
  });

  it("is open until the deadline – and over from that moment", () => {
    const invite = invitation();
    const end = MADE + INVITE_DAYS * DAY;
    expect(inviteExpired(invite, MADE)).toBe(false);
    expect(inviteExpired(invite, end - 1)).toBe(false);
    expect(inviteExpired(invite, end)).toBe(true);
    expect(inviteExpired(invite, end + 30 * DAY)).toBe(true);
  });

  it("counts from the day it was made when it has no date of its own", () => {
    const invite = { createdAt: iso(MADE) };
    expect(inviteEnd(invite)).toEqual(new Date(MADE + INVITE_DAYS * DAY));
    expect(inviteExpired(invite, MADE + 13 * DAY)).toBe(false);
    expect(inviteExpired(invite, MADE + 15 * DAY)).toBe(true);
    expect(inviteExpired({ ...invite, expiresAt: null }, MADE + DAY)).toBe(
      false
    );
  });

  it("cuts one made for 30 days, from before, down to the two weeks", () => {
    const old = { createdAt: iso(MADE), expiresAt: iso(MADE + 30 * DAY) };
    expect(inviteEnd(old)).toEqual(new Date(MADE + INVITE_DAYS * DAY));
    expect(inviteExpired(old, MADE + 20 * DAY)).toBe(true);
  });

  it("ends sooner where its own date says so", () => {
    const short = { createdAt: iso(MADE), expiresAt: iso(MADE + 2 * DAY) };
    expect(inviteExpired(short, MADE + DAY)).toBe(false);
    expect(inviteExpired(short, MADE + 3 * DAY)).toBe(true);
  });

  it("reads dates as the database hands them over, too", () => {
    const invite = {
      createdAt: new Date(MADE),
      expiresAt: new Date(MADE + INVITE_DAYS * DAY),
    };
    expect(inviteExpired(invite, MADE + DAY)).toBe(false);
    expect(inviteExpired(invite, MADE + 14 * DAY)).toBe(true);
  });

  it("takes one that can't say when it ends as over", () => {
    expect(inviteEnd({})).toBeNull();
    expect(inviteExpired({}, MADE)).toBe(true);
    expect(inviteExpired({ createdAt: "soon", expiresAt: 7 }, MADE)).toBe(true);
  });
});

describe("sweeping invitations", () => {
  /** What the query matches – its two conditions, read by hand. */
  const swept = (
    invite: { createdAt: string; expiresAt?: string },
    now: number
  ) => {
    const [made, set] = expiredInvites(now).or as [
      { createdAt: { less_than_equal: string } },
      { expiresAt: { less_than_equal: string } },
    ];
    return (
      invite.createdAt <= made.createdAt.less_than_equal ||
      (invite.expiresAt !== undefined &&
        invite.expiresAt <= set.expiresAt.less_than_equal)
    );
  };

  it("takes exactly the ones that are over", () => {
    const invites = [
      invitation(),
      { createdAt: iso(MADE) },
      { createdAt: iso(MADE), expiresAt: iso(MADE + 30 * DAY) },
      { createdAt: iso(MADE), expiresAt: iso(MADE + 2 * DAY) },
    ];
    const moments = [0, 1, 2, 3, 13, 14, 15, 29, 31].flatMap((days) => [
      MADE + days * DAY - 1,
      MADE + days * DAY,
    ]);
    for (const now of moments) {
      for (const invite of invites) {
        expect(swept(invite, now)).toBe(inviteExpired(invite, now));
      }
    }
  });
});
