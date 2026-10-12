import { describe, expect, it } from "vitest";
import { build, flatten } from "../../src/i18n/flat";
import {
  checkPlaceholders,
  fill,
  partsOf,
  placeholdersOf,
  template,
} from "../../src/i18n/template";

describe("placeholders", () => {
  it("finds each once, in order", () => {
    expect(placeholdersOf("{name}, {when} – {name}")).toEqual([
      "name",
      "when",
    ]);
    expect(placeholdersOf("Hallo!")).toEqual([]);
  });

  it("fills what it has, leaves what it hasn't", () => {
    expect(fill("Hallo {name}!", { name: "Anna" })).toBe("Hallo Anna!");
    expect(fill("{n} Änderungen", { n: 3 })).toBe("3 Änderungen");
    expect(fill("Hallo {name}!")).toBe("Hallo {name}!");
  });

  it("takes values as they are – no placeholder inside one is filled", () => {
    expect(fill("{a} {b}", { a: "{b}", b: "x" })).toBe("{b} x");
  });
});

describe("checking a text from the CMS", () => {
  const named = { known: ["name", "days"], required: ["name"] };

  it("takes the code's placeholders, an optional one may go", () => {
    expect(checkPlaceholders("Hi {name}, {days} days", named)).toBe(true);
    expect(checkPlaceholders("Hi {name}!", named)).toBe(true);
  });

  it("refuses one the code doesn't fill", () => {
    expect(checkPlaceholders("Hi {nmae}!", named)).toMatch("{nmae}");
  });

  it("refuses one missing that is needed", () => {
    expect(checkPlaceholders("Hi there!", named)).toMatch("{name}");
  });

  it("refuses a brace left over", () => {
    expect(checkPlaceholders("Hi {name!", named)).toMatch("brace");
    expect(checkPlaceholders("Hi { name }!", named)).toMatch("brace");
  });

  it("refuses placeholders in a plain text", () => {
    expect(checkPlaceholders("Hallo {name}", { known: [], required: [] }))
      .toMatch("no placeholders");
    expect(checkPlaceholders("Hallo", { known: [], required: [] })).toBe(true);
  });
});

describe("a template", () => {
  const hello = template(
    { named: "Hallo {name}!", unnamed: "Hallo!" },
    (say) => (name: string) => (name ? say.named({ name }) : say.unnamed())
  );
  const invalid = template(
    "Nach {days} Tagen abgelaufen.",
    (say) => say({ days: 14 }),
    { optional: ["days"] }
  );

  it("is one key per wording, with its placeholders", () => {
    expect(partsOf("app.hello", hello)).toEqual([
      {
        key: "app.hello.named",
        text: "Hallo {name}!",
        placeholders: { known: ["name"], required: ["name"] },
      },
      {
        key: "app.hello.unnamed",
        text: "Hallo!",
        placeholders: { known: [], required: [] },
      },
    ]);
    expect(partsOf("auth.invalid", invalid)).toEqual([
      {
        key: "auth.invalid",
        text: "Nach {days} Tagen abgelaufen.",
        placeholders: { known: ["days"], required: [] },
      },
    ]);
  });

  it("makes what the callers had – with the wording in use", () => {
    const shape = { app: { hello }, auth: { invalid } };
    const code = build(shape, shape, (key) => flatten(shape).texts[key]);
    expect(code.app.hello("Anna")).toBe("Hallo Anna!");
    expect(code.app.hello("")).toBe("Hallo!");
    expect(code.auth.invalid).toBe("Nach 14 Tagen abgelaufen.");

    const cms: Record<string, string> = {
      "app.hello.named": "Moin {name}",
      "app.hello.unnamed": "Moin",
      "auth.invalid": "Abgelaufen.",
    };
    const edited = build(shape, shape, (key) => cms[key]);
    expect(edited.app.hello("Anna")).toBe("Moin Anna");
    expect(edited.app.hello("")).toBe("Moin");
    expect(edited.auth.invalid).toBe("Abgelaufen.");
  });
});

describe("flat and back", () => {
  const de = {
    title: "Boop",
    months: ["Januar", "Februar"],
    features: [
      { title: "Stempel", text: "Malen" },
      { title: "Offline", text: "Auch ohne Netz" },
    ],
    pending: template(
      { one: "1 Änderung", many: "{n} Änderungen" },
      (say) => (n: number) => (n === 1 ? say.one() : say.many({ n }))
    ),
    legacy: (name: string) => `Hallo ${name}`,
  };
  const en = {
    title: "Boop",
    months: ["January", "February"],
    features: [
      { title: "Stamps", text: "Draw" },
      { title: "Offline", text: "Without a connection too" },
    ],
    pending: { one: "1 change", many: "{n} changes" },
    legacy: (name: string) => `Hi ${name}`,
  };

  it("numbers a list's entries, also a list of objects", () => {
    expect(Object.keys(flatten(de).texts)).toEqual([
      "title",
      "months.0",
      "months.1",
      "features.0.title",
      "features.0.text",
      "features.1.title",
      "features.1.text",
      "pending.one",
      "pending.many",
    ]);
    expect(Object.keys(flatten(en).texts)).toEqual(
      Object.keys(flatten(de).texts)
    );
  });

  it("leaves a function written by hand to the code", () => {
    expect(flatten(de).codeOnly).toEqual(["legacy"]);
    expect(flatten(de).texts).not.toHaveProperty("legacy");
  });

  it("builds lists back as lists, the language's own function kept", () => {
    const texts = flatten(en).texts;
    const built = build(de, en, (key) => texts[key]);
    expect(built.months).toEqual(["January", "February"]);
    expect(Array.isArray(built.features)).toBe(true);
    expect(built.features[1]).toEqual({
      title: "Offline",
      text: "Without a connection too",
    });
    expect(built.pending(1)).toBe("1 change");
    expect(built.pending(4)).toBe("4 changes");
    expect(built.legacy("Anna")).toBe("Hi Anna");
  });
});
