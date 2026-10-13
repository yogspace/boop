import type { PayloadRequest } from "payload";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFirstCalendar } from "../../src/features/calendar/membership";
import type { Locale } from "../../src/i18n/config";
import { setTexts } from "../../src/i18n/dictionaries";

// The app's paths (@/…) by their relative ones. The CMS's texts are those
// `setTexts` put in use: `getDictionary` would read them from the database.
vi.mock("@/i18n/config", () => import("../../src/i18n/config"));
vi.mock("@/lib/id", () => import("../../src/lib/id"));
vi.mock("@/lib/mail-layout", () => import("../../src/lib/mail-layout"));
vi.mock("@/lib/server-url", () => import("../../src/lib/server-url"));
vi.mock(
  "@/features/accounts/emails",
  () => import("../../src/features/accounts/emails")
);
vi.mock("@/features/translations/get-texts", async () => {
  const { dictionaryOf } = await import("../../src/i18n/dictionaries");
  return { getDictionary: async (locale: Locale) => dictionaryOf(locale) };
});

afterEach(() => setTexts({}));

/** A request whose Payload only notes the calendars it is to make. */
const fakeRequest = () => {
  const made: Record<string, unknown>[] = [];
  const req = {
    payload: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        made.push(data);
        return data;
      },
    },
  } as unknown as PayloadRequest;
  return { req, made };
};

describe("the first calendar", () => {
  it("is the account's own, named in its language", async () => {
    const { req, made } = fakeRequest();
    await createFirstCalendar(req, { id: "a1", locale: "de" });
    await createFirstCalendar(req, { id: "a2", locale: "en" });
    // No language known: German, as the mails.
    await createFirstCalendar(req, { id: "a3" });
    expect(made.map((calendar) => calendar.name)).toEqual([
      "Mein Kalender",
      "My calendar",
      "Mein Kalender",
    ]);
    expect(made[1]).toMatchObject({
      owner: "a2",
      members: ["a2"],
      deleted: false,
    });
  });

  it("takes the CMS's name where it has one", async () => {
    setTexts({ en: { "app.firstCalendar": "Our days" } });
    const { req, made } = fakeRequest();
    await createFirstCalendar(req, { id: "a1", locale: "de" });
    await createFirstCalendar(req, { id: "a2", locale: "en" });
    expect(made.map((calendar) => calendar.name)).toEqual([
      "Mein Kalender",
      "Our days",
    ]);
  });
});
