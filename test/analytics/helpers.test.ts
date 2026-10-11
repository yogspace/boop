import { describe, expect, it } from "vitest";
import {
  ACTION_GROUPS,
  ACTION_NAMES,
  actionLabel,
  groupActions,
  isActionName,
} from "../../src/features/analytics/actions";
import {
  browserLabel,
  deviceClass,
  isBot,
  osLabel,
  sourceOf,
} from "../../src/features/analytics/device-class";
import { pathLabel, pathName } from "../../src/features/analytics/page-names";
import { tally } from "../../src/features/analytics/tally";
import { clientIp, rateLimit } from "../../src/lib/rate-limit";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const WINDOWS_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1";

describe("tally", () => {
  it("counts and sorts by frequency", () => {
    expect(tally(["a", "b", "a", "c", "a", "b"])).toEqual([
      ["a", 3],
      ["b", 2],
      ["c", 1],
    ]);
  });

  it("keeps empty values as a dash instead of dropping them", () => {
    expect(tally([null, undefined, "", "x"])).toEqual([
      ["—", 3],
      ["x", 1],
    ]);
  });
});

describe("device-class", () => {
  it("tells bots apart", () => {
    expect(isBot("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(true);
    expect(isBot("Mozilla/5.0 HeadlessChrome/141.0")).toBe(true);
    expect(isBot(IPHONE)).toBe(false);
  });

  it("sorts devices into classes", () => {
    expect(deviceClass(IPHONE)).toBe("mobile");
    expect(deviceClass(ANDROID)).toBe("mobile");
    expect(deviceClass(IPAD)).toBe("tablet");
    expect(deviceClass(MAC_SAFARI)).toBe("desktop");
    expect(deviceClass(WINDOWS_EDGE)).toBe("desktop");
  });

  it("names the system with its major version only", () => {
    expect(osLabel(IPHONE)).toBe("iOS 18");
    expect(osLabel(ANDROID)).toBe("Android 14 · SM-S911B");
    // Frozen at 10_15_7 since macOS 11 – rather no version than a wrong one.
    expect(osLabel(MAC_SAFARI)).toBe("macOS");
    expect(osLabel(WINDOWS_EDGE)).toBe("Windows");
    expect(osLabel("")).toBe("unknown");
  });

  it("names the browser – Edge before Chrome, iOS browsers by their own", () => {
    expect(browserLabel(IPHONE)).toBe("Safari 18");
    expect(browserLabel(ANDROID)).toBe("Chrome 141");
    expect(browserLabel(MAC_SAFARI)).toBe("Safari 18");
    expect(browserLabel(WINDOWS_EDGE)).toBe("Edge 141");
    expect(browserLabel(IPAD)).toBe("Chrome 140");
  });

  it("groups the referrer coarsely", () => {
    expect(sourceOf(undefined, "boop.example")).toBe("direct");
    expect(sourceOf("", "boop.example")).toBe("direct");
    expect(sourceOf("not a url", "boop.example")).toBe("other");
    expect(sourceOf("https://www.google.de/search?q=x", "boop.example")).toBe(
      "Google"
    );
    expect(sourceOf("https://boop.example/de/app", "boop.example")).toBe(
      "internal"
    );
    expect(sourceOf("https://example.org/a/b?c", "boop.example")).toBe(
      "example.org"
    );
  });
});

describe("page-names", () => {
  it("names the site's pages per locale", () => {
    expect(pathName("/de")).toEqual({ label: "Home", locale: "de" });
    expect(pathName("/en/")).toEqual({ label: "Home", locale: "en" });
    expect(pathName("/en/app")).toEqual({ label: "App", locale: "en" });
    expect(pathName("/de/register")).toEqual({
      label: "Sign up",
      locale: "de",
    });
    expect(pathName("/de/forgot-password", "de")).toEqual({
      label: "Passwort vergessen",
      locale: "de",
    });
  });

  it("leaves unknown paths and locales alone", () => {
    expect(pathName("/fr/app")).toBeNull();
    expect(pathName("/de/wp-admin")).toBeNull();
    expect(pathName("/de/app/extra")).toBeNull();
    expect(pathLabel("/wp-login.php")).toBe("/wp-login.php");
  });

  it("labels with the locale in capitals", () => {
    expect(pathLabel("/en/legal")).toBe("Legal (EN)");
    expect(pathLabel("/de/verify", "de")).toBe("Bestätigen (DE)");
  });
});

describe("actions", () => {
  it("knows its names and labels", () => {
    expect(isActionName("stamp-placed")).toBe(true);
    expect(isActionName("toString")).toBe(false);
    expect(isActionName(42)).toBe(false);
    expect(actionLabel("day-opened")).toBe("Days opened");
    expect(actionLabel("day-opened", "de")).toBe("Tage geöffnet");
    expect(actionLabel("gone-action")).toBe("gone-action");
  });

  it("puts every action into exactly one group", () => {
    const grouped = ACTION_GROUPS.flatMap((group) => group.names);
    expect([...grouped].sort()).toEqual([...ACTION_NAMES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("groups in the fixed order, unknown names last", () => {
    expect(
      groupActions(["export-image", "gone-action", "stamp-placed", "login"])
    ).toEqual([
      { title: "Accounts", names: ["login"] },
      { title: "Stamps", names: ["stamp-placed"] },
      { title: "Export", names: ["export-image"] },
      { title: "Other", names: ["gone-action"] },
    ]);
    expect(groupActions(["stamp-created"], "de")).toEqual([
      { title: "Stempel", names: ["stamp-created"] },
    ]);
  });
});

describe("rate-limit", () => {
  it("lets `limit` through per window, then refuses", () => {
    const tooMany = rateLimit({ limit: 2, windowMs: 1000 });
    expect(tooMany("1.2.3.4", 0)).toBe(false);
    expect(tooMany("1.2.3.4", 10)).toBe(false);
    expect(tooMany("1.2.3.4", 20)).toBe(true);
    // Another caller has its own count.
    expect(tooMany("5.6.7.8", 20)).toBe(false);
    // After the window, again.
    expect(tooMany("1.2.3.4", 1100)).toBe(false);
  });

  it("reads the first forwarded address", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "9.8.7.6, 10.0.0.1" },
    });
    expect(clientIp(request)).toBe("9.8.7.6");
    expect(clientIp(new Request("http://localhost/"))).toBe("unknown");
  });
});
