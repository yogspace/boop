import type { Payload } from "payload";
import { describe, expect, it } from "vitest";
import { DEFAULT_SHAPES } from "../../src/features/calendar/shapes";
import { seedStampShapes } from "../../src/features/site/seed";

type Row = { id: string; key: string; d: string; name: Record<string, string> };

/** The “Site” global in a database of its own – rows with names per language. */
const fakePayload = (stored: Row[]) => {
  let rows = stored;
  let ids = 0;
  const payload = {
    findGlobal: async ({ locale }: { locale: string }) => ({
      stampShapes: rows.map(({ name, ...row }) => ({
        ...row,
        name: name[locale] ?? null,
      })),
    }),
    updateGlobal: async ({
      locale,
      data,
    }: {
      locale: string;
      data: {
        stampShapes: { id?: string; key: string; d: string; name: string }[];
      };
    }) => {
      rows = data.stampShapes.map((row) => {
        const before = rows.find((one) => one.id === row.id);
        return {
          id: row.id ?? `row-${ids++}`,
          key: row.key,
          d: row.d,
          name: { ...(before?.name ?? {}), [locale]: row.name },
        };
      });
    },
  };
  return { payload: payload as unknown as Payload, rows: () => rows };
};

describe("the stamp shapes' seed", () => {
  it("fills in what the list hasn't got – at its end, names in each language", async () => {
    const own: Row = {
      id: "a",
      key: "blob",
      d: "M0 0L10 0L5 10Z",
      name: { de: "Klecks", en: "Blob" },
    };
    const db = fakePayload([own]);
    const summary = await seedStampShapes(db.payload, "fill");
    expect(summary).toContain(`${DEFAULT_SHAPES.length} added`);
    const rows = db.rows();
    expect(rows[0]).toEqual(own);
    expect(rows.slice(1).map((row) => row.key)).toEqual(
      DEFAULT_SHAPES.map((shape) => shape.key)
    );
    expect(rows.find((row) => row.key === "heart")?.name).toEqual({
      de: "Herz",
      en: "Heart",
    });
    // Again: nothing to add.
    expect(await seedStampShapes(db.payload, "fill")).toBe(
      `${rows.length} kept`
    );
  });

  it("sets the list back to the code's on replace", async () => {
    const db = fakePayload([
      {
        id: "a",
        key: "blob",
        d: "M0 0L10 0L5 10Z",
        name: { de: "K", en: "B" },
      },
    ]);
    await seedStampShapes(db.payload, "replace");
    expect(db.rows().map((row) => row.key)).toEqual(
      DEFAULT_SHAPES.map((shape) => shape.key)
    );
    expect(db.rows()[0].name).toEqual(DEFAULT_SHAPES[0].name);
  });
});
