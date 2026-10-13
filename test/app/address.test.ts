import { describe, expect, it } from "vitest";
import {
  addressOf,
  calendarOf,
  PANEL_SLUGS,
  panelOf,
  readAddress,
  slugOf,
  slugsOf,
  VIEW_SLUGS,
  viewOf,
} from "../../src/features/app/address";

const ID = "0b3e7c1a-5d2f-4c8e-9a1b-2c3d4e5f6a7b";

describe("slugOf", () => {
  it("writes small letters and dashes", () => {
    expect(slugOf("Familie", "de")).toBe("familie");
    expect(slugOf("  Sport!!! 2026 ", "de")).toBe("sport-2026");
    expect(slugOf("Mo & Di / Mi", "en")).toBe("mo-di-mi");
  });

  it("writes the umlauts out and drops other accents", () => {
    expect(slugOf("WG Küche", "de")).toBe("wg-kueche");
    expect(slugOf("Ärger, Öl, Über", "de")).toBe("aerger-oel-ueber");
    expect(slugOf("Straße", "de")).toBe("strasse");
    expect(slugOf("GROẞE Reise", "de")).toBe("grosse-reise");
    expect(slugOf("Crème brûlée", "en")).toBe("creme-brulee");
    expect(slugOf("Łódź", "en")).toBe("lodz");
    expect(slugOf("Smørrebrød", "en")).toBe("smorrebrod");
  });

  it("reads umlauts written as a letter and its dots", () => {
    expect(slugOf("Küche", "de")).toBe("kueche");
  });

  it("names a calendar with nothing to write in the page's language", () => {
    expect(slugOf("", "de")).toBe("kalender");
    expect(slugOf("🐶🐱", "en")).toBe("calendar");
    expect(slugOf("---", "de")).toBe("kalender");
  });

  it("cuts long names at a word's end", () => {
    const slug = slugOf(
      "Unser großer gemeinsamer Familienkalender für die Ferien",
      "de"
    );
    expect(slug).toBe("unser-grosser-gemeinsamer");
    expect(slugOf("a".repeat(60), "de")).toBe("a".repeat(40));
    expect(
      slugOf("Mein ganz besonders langer Kalendername hier", "de").length
    ).toBeLessThanOrEqual(40);
    expect(slugOf("x ".repeat(30), "de")).not.toMatch(/-$/);
  });
});

describe("slugsOf", () => {
  const mine = { id: "b", name: "Familie", owner: "me" };
  const anna = { id: "a", name: "Familie", owner: "anna" };
  const sport = { id: "c", name: "Sport", owner: "me" };

  it("gives each calendar its name's slug", () => {
    const slugs = slugsOf([mine, sport], "me", "de");
    expect(slugs.get("b")).toBe("familie");
    expect(slugs.get("c")).toBe("sport");
  });

  it("puts the own calendar ahead of a shared one of the same name", () => {
    const slugs = slugsOf([anna, mine], "me", "de");
    expect(slugs.get("b")).toBe("familie");
    expect(slugs.get("a")).toBe("familie-2");
  });

  it("counts on by id among the same kind", () => {
    const slugs = slugsOf(
      [
        { id: "z", name: "Familie", owner: "me" },
        { id: "y", name: "familie", owner: "me" },
        { id: "x", name: "FAMILIE!", owner: "me" },
      ],
      "me",
      "de"
    );
    expect([slugs.get("x"), slugs.get("y"), slugs.get("z")]).toEqual([
      "familie",
      "familie-2",
      "familie-3",
    ]);
  });

  it("keeps a name that is a number already", () => {
    const two = { id: "d", name: "Familie 2", owner: "anna" };
    const slugs = slugsOf([anna, mine, two], "me", "de");
    expect(slugs.get("b")).toBe("familie");
    expect(slugs.get("d")).toBe("familie-2");
    expect(slugs.get("a")).toBe("familie-3");
  });

  it("comes out the same whatever the order", () => {
    const list = [anna, mine, sport, { id: "e", name: "", owner: "ben" }];
    const once = slugsOf(list, "me", "en");
    const again = slugsOf([...list].reverse(), "me", "en");
    expect([...again].sort()).toEqual([...once].sort());
    expect(new Set(once.values()).size).toBe(list.length);
  });
});

describe("calendarOf", () => {
  const slugs = new Map([
    [ID, "familie"],
    ["c2", "familie-2"],
  ]);

  it("finds a calendar by its slug, in any case", () => {
    expect(calendarOf("familie", slugs)).toBe(ID);
    expect(calendarOf("Familie-2", slugs)).toBe("c2");
  });

  it("still finds one by its id – the addresses before the slugs", () => {
    expect(calendarOf(ID, slugs)).toBe(ID);
  });

  it("knows no other", () => {
    expect(calendarOf("sport", slugs)).toBeNull();
    expect(calendarOf(null, slugs)).toBeNull();
  });
});

describe("the address", () => {
  it("reads calendar and view", () => {
    expect(readAddress("/de/app/familie/heute")).toEqual({
      calendar: "familie",
      view: "today",
      day: null,
      panel: null,
    });
    expect(readAddress("/en/app/family/month")).toEqual({
      calendar: "family",
      view: "month",
      day: null,
      panel: null,
    });
  });

  it("reads the views in either language", () => {
    expect(readAddress("/en/app/familie/monat").view).toBe("month");
    expect(readAddress("/de/app/familie/today").view).toBe("today");
    expect(readAddress("/de/app/familie/year").view).toBe("year");
    expect(readAddress("/en/app/family/jahr").view).toBe("year");
    expect(viewOf("Heute")).toBeNull();
    expect(viewOf(undefined)).toBeNull();
  });

  it("reads what is there, and nothing else", () => {
    const none = { calendar: null, view: null, day: null, panel: null };
    expect(readAddress("/de/app")).toEqual(none);
    expect(readAddress("/de/app/")).toEqual(none);
    expect(readAddress(`/de/app/${ID}`)).toEqual({ ...none, calendar: ID });
    expect(readAddress("/de/app/familie/quatsch")).toEqual({
      ...none,
      calendar: "familie",
    });
    expect(readAddress("/de/login").calendar).toBeNull();
    expect(readAddress("/de/app/k%C3%BCche").calendar).toBe("küche");
    expect(readAddress("/de/app/%E0%A4").calendar).toBe("%E0%A4");
  });

  it("has the day open in the month or the year – a real one", () => {
    expect(addressOf("de", "familie", "month", { day: "2026-10-13" })).toBe(
      "/de/app/familie/monat/2026-10-13"
    );
    expect(addressOf("en", "family", "year", { day: "2026-02-28" })).toBe(
      "/en/app/family/year/2026-02-28"
    );
    expect(addressOf("de", "familie", "today", { day: "2026-10-13" })).toBe(
      "/de/app/familie/heute"
    );
    expect(addressOf("de", null, "month", { day: "2026-10-13" })).toBe(
      "/de/app"
    );
    expect(readAddress("/de/app/familie/monat/2026-10-13").day).toBe(
      "2026-10-13"
    );
    expect(readAddress("/en/app/family/jahr/2026-10-13").day).toBe(
      "2026-10-13"
    );
    expect(readAddress("/de/app/familie/heute/2026-10-13").day).toBeNull();
    expect(readAddress("/de/app/familie/monat/2026-02-30").day).toBeNull();
    expect(readAddress("/de/app/familie/monat/quatsch").day).toBeNull();
    expect(readAddress("/de/app/familie/2026-10-13")).toEqual({
      calendar: "familie",
      view: null,
      day: null,
      panel: null,
    });
  });

  it("has the sheet open over a view – in either language", () => {
    expect(addressOf("de", "familie", "today", { panel: "settings" })).toBe(
      "/de/app/familie/heute/einstellungen"
    );
    expect(addressOf("en", "family", "month", { panel: "share" })).toBe(
      "/en/app/family/month/share"
    );
    expect(addressOf("de", "familie", "year", { panel: "account" })).toBe(
      "/de/app/familie/jahr/konto"
    );
    expect(readAddress("/en/app/family/today/einstellungen").panel).toBe(
      "settings"
    );
    expect(readAddress("/de/app/familie/teilen").panel).toBeNull();
    expect(readAddress("/de/app/familie/heute/quatsch").panel).toBeNull();
    expect(panelOf("Konto")).toBeNull();
  });

  it("writes the view in the page's language", () => {
    expect(addressOf("de", "familie", "today")).toBe("/de/app/familie/heute");
    expect(addressOf("de", "familie", "month")).toBe("/de/app/familie/monat");
    expect(addressOf("en", "family", "today")).toBe("/en/app/family/today");
    expect(addressOf("de", "familie", "year")).toBe("/de/app/familie/jahr");
    expect(addressOf("en", "family", "year")).toBe("/en/app/family/year");
    expect(addressOf("en", null, "month")).toBe("/en/app");
  });

  it("reads back what it writes", () => {
    for (const locale of ["de", "en"] as const) {
      for (const view of ["today", "month", "year"] as const) {
        const none = { calendar: "wg-kueche", view, day: null, panel: null };
        expect(readAddress(addressOf(locale, "wg-kueche", view))).toEqual(none);
        expect(
          readAddress(
            addressOf(locale, "wg-kueche", view, { day: "2026-10-13" })
          )
        ).toEqual({ ...none, day: view === "today" ? null : "2026-10-13" });
        for (const panel of ["settings", "share", "account"] as const) {
          expect(
            readAddress(addressOf(locale, "wg-kueche", view, { panel }))
          ).toEqual({ ...none, panel });
          expect(PANEL_SLUGS[locale][panel]).toMatch(/^[a-z]+$/);
        }
        expect(VIEW_SLUGS[locale][view]).toMatch(/^[a-z]+$/);
      }
    }
  });
});
