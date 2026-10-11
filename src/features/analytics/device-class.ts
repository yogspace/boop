/**
 * What can be read from the user agent – and only from it.
 *
 * Every browser sends the user agent with each request by itself. Anything
 * finer (screen size, pixel density, fonts) would have to be read OUT of the
 * device by JavaScript – access under § 25 TDDDG, needing consent, and a
 * fingerprint instead of a coarse group.
 *
 * Not available: the Apple device model. An iPhone says “iPhone” and its iOS
 * version, never which iPhone. Android often names the model.
 */

/** A machine rather than a person? (crawlers, link previews, scanners) */
export const isBot = (userAgent: string): boolean =>
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|preview/i.test(
    userAgent
  );

/**
 * mobile, tablet or desktop. Since iPadOS an iPad says it is a Mac and so
 * lands in desktop – Apple's choice, not to be told apart without access to
 * the device.
 */
export const deviceClass = (userAgent: string): string => {
  if (/ipad|tablet|playbook|silk/i.test(userAgent)) return "tablet";
  if (/mobi|iphone|android.*mobile|windows phone/i.test(userAgent)) {
    return "mobile";
  }
  return "desktop";
};

/**
 * Operating system with its major version – “iOS 18”, “Android 14”, “macOS”,
 * “Windows”. Only the major version: the minor one tells hardly anyone apart
 * but gives away a device's patch level.
 */
export const osLabel = (userAgent: string): string => {
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    const ios = userAgent.match(/OS (\d+)[._]/);
    return ios ? `iOS ${ios[1]}` : "iOS";
  }

  const android = userAgent.match(/Android (\d+)/);
  if (android) {
    // Android often sends the model: “Android 14; SM-S911B Build/…”
    const model = userAgent.match(
      /Android \d+(?:\.\d+)*;\s*([^;)]+?)(?: Build)?[;)]/
    );
    const name = model?.[1]?.trim();
    return name && name !== "K"
      ? `Android ${android[1]} · ${name}`
      : `Android ${android[1]}`;
  }

  // Since macOS 11 Safari freezes this at 10_15_7 – then rather no version
  // than a wrong one.
  const mac = userAgent.match(/Mac OS X (\d+)[._](\d+)/);
  if (mac) {
    return mac[1] === "10" && Number(mac[2]) >= 15
      ? "macOS"
      : `macOS ${mac[1]}`;
  }

  // Windows has said “NT 10.0” since 10 – 10 and 11 cannot be told apart.
  if (/Windows NT/.test(userAgent)) return "Windows";
  if (/CrOS/.test(userAgent)) return "ChromeOS";
  if (/Linux/.test(userAgent)) return "Linux";
  return "unknown";
};

/** Browser with its major version – “Safari 18”, “Chrome 141”. */
export const browserLabel = (userAgent: string): string => {
  // The order matters: Edge says “Chrome” too, and every iOS browser says
  // “Safari”.
  const patterns: [string, RegExp][] = [
    ["Edge", /Edg(?:e|A|iOS)?\/(\d+)/],
    ["Chrome", /CriOS\/(\d+)/],
    ["Firefox", /FxiOS\/(\d+)/],
    ["Firefox", /Firefox\/(\d+)/],
    ["Chrome", /Chrome\/(\d+)/],
  ];
  for (const [name, pattern] of patterns) {
    const match = userAgent.match(pattern);
    if (match) return `${name} ${match[1]}`;
  }
  // Not `Version/… Safari` in one go: on the iPhone the build number sits in
  // between (“Version/18.0 Mobile/15E148 Safari/604.1”).
  const safari = /Safari\//.test(userAgent)
    ? userAgent.match(/Version\/(\d+)/)
    : null;
  return safari ? `Safari ${safari[1]}` : "unknown";
};

const KNOWN_SOURCES: Record<string, string> = {
  "google.com": "Google",
  "google.de": "Google",
  "bing.com": "Bing",
  "duckduckgo.com": "DuckDuckGo",
  "ecosia.org": "Ecosia",
  "instagram.com": "Instagram",
  "l.instagram.com": "Instagram",
  "facebook.com": "Facebook",
  "l.facebook.com": "Facebook",
  "m.facebook.com": "Facebook",
  "t.co": "X",
  "x.com": "X",
  "bsky.app": "Bluesky",
  "reddit.com": "Reddit",
  "pinterest.com": "Pinterest",
  "pinterest.de": "Pinterest",
  "linkedin.com": "LinkedIn",
  "github.com": "GitHub",
};

/** Where a visit came from, as a coarse group – never the full address. */
export const sourceOf = (referrer: string | undefined, ownHost: string) => {
  if (!referrer) return "direct";
  let host: string;
  try {
    host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "other";
  }
  if (host === ownHost) return "internal";
  return KNOWN_SOURCES[host] ?? host;
};
