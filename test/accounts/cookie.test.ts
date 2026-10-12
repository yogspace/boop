import { describe, expect, it } from "vitest";
import {
  loginCookies,
  logoutCookies,
  REMEMBER_SECONDS,
  SESSION_COOKIE,
  SESSION_ONLY_COOKIE,
  SESSION_ONLY_SECONDS,
  sessionOnlyOver,
} from "../../src/features/accounts/cookie";

const parts = (line: string) => line.split("; ");
const named = (lines: string[], name: string) =>
  lines.find((line) => line.startsWith(`${name}=`)) ?? "";

describe("the login cookies", () => {
  const until = new Date("2026-11-11T08:00:00.000Z");

  it("stay for 30 days with “stay logged in”", () => {
    expect(REMEMBER_SECONDS).toBe(30 * 24 * 60 * 60);
    const cookies = loginCookies("token", until);
    const login = parts(named(cookies, SESSION_COOKIE));
    expect(login).toContain(`${SESSION_COOKIE}=token`);
    expect(login).toContain(`Expires=${until.toUTCString()}`);
    // No login for one session only – its sign goes, should one be left.
    expect(named(cookies, SESSION_ONLY_COOKIE)).toContain(
      `Expires=${new Date(0).toUTCString()}`
    );
  });

  it("go with the browser without it – no date on either", () => {
    expect(SESSION_ONLY_SECONDS).toBe(24 * 60 * 60);
    const cookies = loginCookies("token", null);
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) {
      expect(cookie).not.toMatch(/expires|max-age/i);
    }
    expect(parts(named(cookies, SESSION_ONLY_COOKIE))).toContain(
      `${SESSION_ONLY_COOKIE}=1`
    );
  });

  it("keep the token out of the page's reach – only the sign is seen", () => {
    for (const expires of [until, null]) {
      const cookies = loginCookies("token", expires);
      const login = parts(named(cookies, SESSION_COOKIE));
      expect(login).toContain("HttpOnly");
      expect(login).toContain("SameSite=Lax");
      expect(login).toContain("Path=/");
    }
    const sign = parts(named(loginCookies("token", null), SESSION_ONLY_COOKIE));
    expect(sign).not.toContain("HttpOnly");
    expect(sign.join()).not.toContain("token");
  });

  it("are both taken away at logout", () => {
    const cookies = logoutCookies();
    for (const name of [SESSION_COOKIE, SESSION_ONLY_COOKIE]) {
      const cookie = parts(named(cookies, name));
      expect(cookie).toContain(`${name}=`);
      expect(cookie).toContain(`Expires=${new Date(0).toUTCString()}`);
    }
  });
});

describe("a login for one browser session", () => {
  const since = Date.parse("2026-10-12T08:00:00.000Z");
  const HOUR = 60 * 60 * 1000;

  it("is on while its sign is there and its token lasts", () => {
    expect(sessionOnlyOver({ since, sign: true, now: since })).toBe(false);
    expect(sessionOnlyOver({ since, sign: true, now: since + 23 * HOUR })).toBe(
      false
    );
  });

  it("is over once the browser was closed – the sign is gone", () => {
    expect(sessionOnlyOver({ since, sign: false, now: since + 1 })).toBe(true);
  });

  it("is over after a day, should the browser bring the sign back", () => {
    expect(sessionOnlyOver({ since, sign: true, now: since + 24 * HOUR })).toBe(
      true
    );
  });
});
