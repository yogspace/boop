import type { Field } from "payload";
import { afterEach, describe, expect, it } from "vitest";
import { reminderMessage, stampedMessage } from "../../src/features/push/rules";
import {
  TRANSLATION_DEFAULTS,
  TRANSLATION_KEYS,
} from "../../src/features/translations/defaults";
import {
  buildTree,
  storedPath,
  translationFields,
} from "../../src/features/translations/tree";
import { LOCALES } from "../../src/i18n/config";
import {
  CODE_ONLY,
  CODE_TEXTS,
  dictionaryOf,
  fits,
  PLACEHOLDERS,
  setTexts,
  usableTexts,
} from "../../src/i18n/dictionaries";
import { checkPlaceholders } from "../../src/i18n/template";

/** The stored paths the global's fields lead to. */
const pathsOf = (fields: Field[], prefix = ""): string[] =>
  fields.flatMap((field) => {
    if (field.type === "collapsible") return pathsOf(field.fields, prefix);
    if (field.type === "group" && "name" in field) {
      return pathsOf(field.fields, `${prefix}${field.name}.`);
    }
    return "name" in field ? [`${prefix}${field.name}`] : [];
  });

const NONE = { known: [], required: [] };

afterEach(() => setTexts({}));

describe("the dictionary in the CMS", () => {
  it("has every text as a field, no two keys in one place", () => {
    expect(() => buildTree(TRANSLATION_KEYS)).not.toThrow();
    const fields = translationFields(
      TRANSLATION_KEYS,
      TRANSLATION_DEFAULTS,
      PLACEHOLDERS
    );
    const paths = pathsOf(fields);
    expect(paths.sort()).toEqual(TRANSLATION_KEYS.map(storedPath).sort());
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("has a few hundred of them, lists and templates included", () => {
    expect(TRANSLATION_KEYS.length).toBeGreaterThan(300);
    expect(TRANSLATION_KEYS).toContain("app.months.11");
    expect(TRANSLATION_KEYS).toContain("landing.features.3.text");
    expect(TRANSLATION_KEYS).toContain("app.hello.named");
    expect(TRANSLATION_KEYS).toContain("app.push.reminderBody.many");
    expect(TRANSLATION_KEYS).toContain("auth.invite.invalid");
  });

  it("has English for every German key – lists as long", () => {
    expect(Object.keys(CODE_TEXTS.en)).toEqual(Object.keys(CODE_TEXTS.de));
  });

  it("has code texts that pass their own check, in both languages", () => {
    const misfits = LOCALES.flatMap((locale) =>
      Object.entries(CODE_TEXTS[locale])
        .filter(
          ([key, text]) =>
            checkPlaceholders(text, PLACEHOLDERS[key] ?? NONE) !== true
        )
        .map(([key]) => `${locale}:${key}`)
    );
    expect(misfits).toEqual([]);
  });

  // A function written by hand stays in the code, outside the CMS – until
  // it is a template (i18n/template.ts).
  for (const key of CODE_ONLY) {
    it.todo(`${key}: still a function – make it a template`);
  }
});

describe("the texts in use", () => {
  it("are the code's to begin with", () => {
    const t = dictionaryOf("de");
    expect(t.app.hello("Anna")).toBe("Hallo Anna!");
    expect(t.app.hello("")).toBe("Hallo!");
    expect(t.app.pending(1)).toBe("1 Änderung wartet");
    expect(t.app.pending(3)).toBe("3 Änderungen warten");
    expect(t.auth.invite.invalid).toMatch("nach 14 Tagen");
    expect(t.app.share.invited("a@b.de")).toMatch("a@b.de");
    expect(t.app.share.invited("a@b.de")).toMatch("14 Tage");
    expect(t.app.months).toHaveLength(12);
    expect(dictionaryOf("en").app.months[0]).toBe("January");
    expect(dictionaryOf("en").auth.invite.expired("")).toBe(
      "Invitations are valid for 14 days – this one has expired, sorry. Just ask for a new one."
    );
  });

  it("are the CMS's where it has one that fits", () => {
    setTexts({
      de: {
        "app.lead": "Na, welcher Tag?",
        "app.months.0": "Jänner",
        "app.pending.many": "{n} Dinge warten",
        "landing.features.0.title": "Deine Stempel",
      },
      en: { "app.hello.named": "Hey {name}!" },
    });
    const de = dictionaryOf("de");
    expect(de.app.lead).toBe("Na, welcher Tag?");
    expect(de.app.months[0]).toBe("Jänner");
    expect(de.app.months[1]).toBe("Februar");
    expect(de.app.pending(3)).toBe("3 Dinge warten");
    expect(de.app.pending(1)).toBe("1 Änderung wartet");
    expect(de.landing.features[0].title).toBe("Deine Stempel");
    expect(de.landing.features[0].text).toMatch("Kritzel");
    expect(dictionaryOf("en").app.hello("Anna")).toBe("Hey Anna!");
    expect(dictionaryOf("en").app.lead).toBe("Which day gets a boop today?");
  });

  it("fall back to the code's where the CMS's doesn't fit", () => {
    setTexts({
      de: {
        "app.hello.named": "Hallo {vorname}!",
        "app.pending.many": "Ein paar Änderungen warten",
        "app.lead": "   ",
        "app.gone": "Weg",
        "app.months.12": "Dreizehnter",
      },
    });
    const de = dictionaryOf("de");
    expect(de.app.hello("Anna")).toBe("Hallo Anna!");
    expect(de.app.pending(3)).toBe("3 Änderungen warten");
    expect(de.app.lead).toBe("Welcher Tag bekommt heute einen Boop?");
    expect(de.app.months).toHaveLength(12);
    expect(de.app).not.toHaveProperty("gone");
  });

  it("a page carries only what differs from the code and fits", () => {
    expect(
      usableTexts({
        de: {
          "app.lead": "Welcher Tag bekommt heute einen Boop?",
          "app.loading": "Lädt …",
          "app.hello.named": "Hallo {wer}!",
          nope: "x",
        },
        en: {},
        fr: { "app.lead": "Quel jour ?" },
      })
    ).toEqual({ de: { "app.loading": "Lädt …" } });
    expect(usableTexts(null)).toEqual({});
    expect(fits("app.hello.named", "Moin {name}")).toBe(true);
    expect(fits("app.hello.named", "Moin")).toBe(false);
  });

  it("stay the same object while the texts do", () => {
    setTexts({ de: { "app.lead": "Na?" } });
    const first = dictionaryOf("de");
    setTexts({ de: { "app.lead": "Na?" } });
    expect(dictionaryOf("de")).toBe(first);
    setTexts({ de: { "app.lead": "Na, du?" } });
    expect(dictionaryOf("de")).not.toBe(first);
    expect(dictionaryOf("de").app.lead).toBe("Na, du?");
  });

  it("reach the notifications, when the server hands them over", () => {
    setTexts({
      de: {
        "app.push.stampedBody": "{name} war in „{calendar}“ fleißig.",
        "app.push.reminderBody.quote": "»{name}«",
      },
    });
    const t = dictionaryOf("de").app.push;
    expect(
      stampedMessage(
        "de",
        { name: "Anna", calendar: { id: "c1", name: "Familie" } },
        t
      ).body
    ).toBe("Anna war in „Familie“ fleißig.");
    expect(
      reminderMessage(
        "de",
        [
          { id: "c1", name: "Familie" },
          { id: "c2", name: "Sport" },
        ],
        t
      ).body
    ).toBe("»Familie« und »Sport« warten noch auf deinen Stempel.");
  });
});
