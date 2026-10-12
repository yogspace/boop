import type { Field } from "payload";
import { describe, expect, it } from "vitest";
import { unusedIn } from "../../src/features/translations/seed";
import {
  buildTree,
  setValueAt,
  storedPath,
  storedTexts,
  textAt,
  translationFields,
} from "../../src/features/translations/tree";

/** The stored paths a list of fields leads to – as Payload would keep them. */
const pathsOf = (fields: Field[], prefix = ""): string[] =>
  fields.flatMap((field) => {
    if (field.type === "collapsible") return pathsOf(field.fields, prefix);
    if (field.type === "group" && "name" in field) {
      return pathsOf(field.fields, `${prefix}${field.name}.`);
    }
    return "name" in field ? [`${prefix}${field.name}`] : [];
  });

/** The leaf field at a stored path. */
const fieldAt = (fields: Field[], path: string): Field | undefined => {
  const [head, ...rest] = path.split(".");
  for (const field of fields) {
    if (field.type === "collapsible") {
      const found = fieldAt(field.fields, path);
      if (found) return found;
    } else if ("name" in field && field.name === head) {
      if (!rest.length) return field;
      if (field.type === "group") return fieldAt(field.fields, rest.join("."));
    }
  }
};

describe("the stored names", () => {
  it("keeps a key as it is", () => {
    expect(storedPath("app.draw.title")).toBe("app.draw.title");
  });

  it("gives a list's entries a name, not a number", () => {
    expect(storedPath("app.months.0")).toBe("app.months._0");
    expect(storedPath("landing.features.3.text")).toBe(
      "landing.features._3.text"
    );
  });

  it("steps around the names Mongoose has for itself", () => {
    expect(storedPath("app.push.on")).toBe("app.push.on_");
    expect(storedPath("app.day.remove")).toBe("app.day.remove_");
    expect(storedPath("app.save")).toBe("app.save_");
  });

  it("reads and writes through them", () => {
    const data: Record<string, unknown> = {};
    setValueAt(data, "app.months.0", "Januar");
    setValueAt(data, "app.push.on", "An");
    expect(data).toEqual({
      app: { months: { _0: "Januar" }, push: { on_: "An" } },
    });
    expect(textAt(data, "app.months.0")).toBe("Januar");
    expect(textAt(data, "app.push.on")).toBe("An");
    expect(textAt(data, "app.push.off")).toBeUndefined();
  });
});

describe("the tree", () => {
  it("throws where a key is also a group", () => {
    expect(() => buildTree(["a.b", "a.b.c"])).toThrow("collides");
    expect(() => buildTree(["a.b.c", "a.b"])).toThrow("collides");
  });

  it("throws where two keys are stored alike", () => {
    expect(() => buildTree(["a.on", "a.on_"])).toThrow("collide");
    expect(() => buildTree(["a.0", "a._0"])).toThrow("collide");
  });
});

describe("the fields", () => {
  const keys = ["app.hello.named", "app.months.0", "app.push.on", "meta.title"];
  const fields = translationFields(
    keys,
    {
      "app.hello.named": { de: "Hallo {name}!", en: "Hi {name}!" },
      "app.months.0": { de: "Januar", en: "January" },
      "app.push.on": { de: "An", en: "On" },
      "meta.title": { de: "x".repeat(81), en: "y" },
    },
    { "app.hello.named": { known: ["name"], required: ["name"] } }
  );

  it("lead to every key – each top level its own section", () => {
    expect(pathsOf(fields).sort()).toEqual(keys.map(storedPath).sort());
    expect(fields.map((field) => field.type)).toEqual([
      "collapsible",
      "collapsible",
    ]);
  });

  it("are localized, show the code's text and the placeholders", () => {
    const hello = fieldAt(fields, "app.hello.named") as {
      localized?: boolean;
      type: string;
      admin?: { description?: string };
    };
    expect(hello.localized).toBe(true);
    expect(hello.type).toBe("text");
    expect(hello.admin?.description).toBe(
      "DE: Hallo {name}!  ·  EN: Hi {name}!  ·  Keeps {name}"
    );
    expect(fieldAt(fields, "meta.title")?.type).toBe("textarea");
    expect(fieldAt(fields, "app.months._0")).toMatchObject({ label: "1" });
  });

  it("refuse a placeholder the code doesn't fill, or one missing", () => {
    const { validate } = fieldAt(fields, "app.hello.named") as unknown as {
      validate: (value: unknown, options: { previousValue?: unknown }) => unknown;
    };
    expect(validate("Moin {name}!", {})).toBe(true);
    expect(validate("Moin {nmae}!", {})).toMatch("{nmae}");
    expect(validate("Moin!", {})).toMatch("{name}");
    // Empty: the code's text shows.
    expect(validate("", {})).toBe(true);
    // Stored before the code changed, untouched: saving others still works.
    expect(validate("Moin {vorname}!", { previousValue: "Moin {vorname}!" }))
      .toBe(true);
    const plain = fieldAt(fields, "app.push.on") as unknown as typeof hello & {
      validate: typeof validate;
    };
    expect(plain.validate("An {x}", {})).toMatch("no placeholders");
  });
});

describe("the stored texts", () => {
  it("come back flat per language – known keys, nothing empty, untrimmed", () => {
    const doc = {
      id: "x",
      updatedAt: "2026-10-12",
      landing: { title: { _0: { de: "Jeder Tag verdient einen ", en: "" } } },
      app: { push: { on_: { de: "An", en: "On" } } },
      old: { thing: { de: "a", en: "a" } },
    };
    expect(
      storedTexts(doc, ["landing.title.0", "app.push.on", "app.save"])
    ).toEqual({
      de: { "landing.title.0": "Jeder Tag verdient einen ", "app.push.on": "An" },
      en: { "app.push.on": "On" },
    });
  });
});

describe("unusedIn", () => {
  const keys = ["app.draw.title", "app.push.on", "app.months.0", "app.save"];

  it("finds keys and groups the code no longer has, keeps the rest", () => {
    const doc = {
      _id: "x",
      globalType: "translations",
      updatedAt: "2026-10-12",
      app: {
        draw: {
          title: { de: "Neuer Stempel", en: "New stamp" },
          // a removed key in a group that stays
          undo: { de: "Zurück", en: "Undo" },
        },
        // reserved names are stored with an underscore
        push: { on_: { de: "An", en: "On" } },
        save_: { de: "Speichern", en: "Save" },
        // a list that got shorter
        months: { _0: { de: "Januar", en: "January" }, _1: { de: "F" } },
      },
      // a whole group the code no longer has
      old: { thing: { de: "a", en: "a" } },
    };
    expect(unusedIn(doc, keys).sort()).toEqual(
      ["app.draw.undo", "app.months._1", "old"].sort()
    );
  });

  it("finds nothing when all is in use", () => {
    expect(
      unusedIn(
        { globalType: "translations", app: { save_: { de: "S", en: "S" } } },
        keys
      )
    ).toEqual([]);
  });
});
