import { describe, expect, it } from "vitest";
import { noteId } from "../../src/features/calendar/note";
import {
  cleanPrefs,
  LONG_AGO,
  oldPrefChanges,
  prefData,
  prefId,
} from "../../src/features/calendar/prefs";
import { isId } from "../../src/lib/id";

const HOME = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const SPORT = "9a8b7c6d-5e4f-4321-8765-0fedcba98765";
const ME = "6710f3c2a1b2c3d4e5f60718";
const ANNA = "6710f3c2a1b2c3d4e5f60719";

describe("one's own settings' id", () => {
  it("is the same on every device – an id the sync takes", () => {
    const id = prefId(ME, HOME);
    expect(prefId(ME, HOME)).toBe(id);
    expect(isId(id)).toBe(true);
    expect(id[14]).toBe("5");
  });

  it("is one per account and calendar – and never a note's", () => {
    const id = prefId(ME, HOME);
    expect(prefId(ANNA, HOME)).not.toBe(id);
    expect(prefId(ME, SPORT)).not.toBe(id);
    expect(noteId(HOME, ME)).not.toBe(id);
  });
});

describe("one's own settings, checked", () => {
  it("keep a color's key and a view – nothing else", () => {
    expect(cleanPrefs({ color: "mint", start: "year" })).toEqual({
      color: "mint",
      start: "year",
    });
    expect(
      cleanPrefs({ color: "#ff0000", start: "week", view: "today", x: 1 })
    ).toEqual({});
    expect(cleanPrefs({ color: null, start: "today" })).toEqual({
      start: "today",
    });
    expect(cleanPrefs(null)).toEqual({});
  });

  it("go out with both – set or not", () => {
    expect(prefData(HOME, { start: "today" })).toEqual({
      calendar: HOME,
      color: null,
      start: "today",
    });
  });
});

describe("a device's settings from before", () => {
  it("go out once per calendar still there, as old as can be", () => {
    const changes = oldPrefChanges(
      ME,
      {
        [HOME]: { color: "sun", view: "year" },
        [SPORT]: { start: "today" },
        // Nothing set – nothing to send.
        "11111111-2222-4333-8444-555555555555": { view: "month" },
        // Off this device by now.
        "22222222-2222-4333-8444-555555555555": { color: "mint" },
      },
      (calendar) => calendar !== "22222222-2222-4333-8444-555555555555"
    );
    expect(changes).toEqual([
      {
        type: "pref",
        id: prefId(ME, HOME),
        changedAt: LONG_AGO,
        data: { calendar: HOME, color: "sun", start: null },
      },
      {
        type: "pref",
        id: prefId(ME, SPORT),
        changedAt: LONG_AGO,
        data: { calendar: SPORT, color: null, start: "today" },
      },
    ]);
    expect(LONG_AGO).toBe("1970-01-01T00:00:00.000Z");
  });
});
