import type { Payload } from "payload";
import { describe, expect, it } from "vitest";
import { DEFAULT_SHAPES } from "../../src/features/calendar/shapes";
import { DEFAULT_TEMPLATES } from "../../src/features/calendar/templates";
import {
  seedDrawingTemplates,
  seedStampShapes,
} from "../../src/features/site/seed";

type Row = {
  id: string;
  key: string;
  d: string;
  order: number;
  filled?: boolean;
  name: Record<string, string>;
};

/**
 * The two collections in a database of their own – names per language – and
 * the “Site” global's document as the database keeps it, lists from before
 * included.
 */
const fakePayload = (
  stored: Record<string, Row[]> = {},
  site: Record<string, unknown> | null = null
) => {
  const db: Record<string, Row[]> = {
    "stamp-shapes": [],
    "drawing-templates": [],
    ...stored,
  };
  let ids = 0;
  const payload = {
    find: async ({ collection }: { collection: string }) => ({
      docs: db[collection].map(({ name, ...row }) => ({
        ...row,
        name: name.de,
      })),
    }),
    create: async ({
      collection,
      locale,
      data,
    }: {
      collection: string;
      locale: string;
      data: Omit<Row, "id" | "name"> & { name: string };
    }) => {
      const row = {
        ...data,
        id: `row-${ids++}`,
        name: { [locale]: data.name },
      };
      db[collection].push(row);
      return row;
    },
    update: async ({
      collection,
      id,
      locale,
      data,
    }: {
      collection: string;
      id: string;
      locale: string;
      data: { name: string };
    }) => {
      const row = db[collection].find((one) => one.id === id);
      if (row) row.name = { ...row.name, [locale]: data.name };
      return row;
    },
    delete: async ({ collection }: { collection: string }) => {
      db[collection] = [];
    },
    db: {
      globals: {
        collection: {
          findOne: async ({ globalType }: { globalType: string }) =>
            globalType === "site" ? site : null,
        },
      },
    },
  };
  return {
    payload: payload as unknown as Payload,
    rows: (collection = "stamp-shapes") => db[collection],
  };
};

const blob: Row = {
  id: "a",
  key: "blob",
  d: "M0 0L10 0L5 10Z",
  order: 10,
  name: { de: "Klecks", en: "Blob" },
};

describe("the stamp shapes' seed", () => {
  it("fills in what the collection hasn't got – after the last, named in each language", async () => {
    const db = fakePayload({ "stamp-shapes": [blob] });
    const summary = await seedStampShapes(db.payload, "fill");
    expect(summary).toContain(`${DEFAULT_SHAPES.length} added`);
    const rows = db.rows();
    expect(rows[0]).toEqual(blob);
    expect(rows.slice(1).map((row) => row.key)).toEqual(
      DEFAULT_SHAPES.map((shape) => shape.key)
    );
    expect(rows.slice(1).map((row) => row.order)).toEqual(
      DEFAULT_SHAPES.map((_, i) => 20 + i * 10)
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

  it("sets the collection back to the code's on replace", async () => {
    const db = fakePayload({ "stamp-shapes": [blob] });
    await seedStampShapes(db.payload, "replace");
    expect(db.rows().map((row) => row.key)).toEqual(
      DEFAULT_SHAPES.map((shape) => shape.key)
    );
    expect(db.rows()[0]).toMatchObject({
      name: DEFAULT_SHAPES[0].name,
      order: 10,
    });
  });

  it("takes over the list “Site” had, while the collection is empty – as it was, checked", async () => {
    const db = fakePayload(
      {},
      {
        globalType: "site",
        stampShapes: [
          {
            id: "x",
            key: "blob",
            d: " M0 0L10 0L5 10Z ",
            name: { de: "Klecks", en: "Blob" },
          },
          // Its name in one language only: the other's is filled in.
          {
            id: "y",
            key: "heart",
            d: DEFAULT_SHAPES[3].d,
            name: { de: "Mein Herz" },
          },
          // Not a shape: no outline.
          { id: "z", key: "line", d: "M0 0L10 10", name: { de: "Strich" } },
        ],
      }
    );
    expect(await seedStampShapes(db.payload, "fill")).toBe(
      "2 taken over from Site (blob, heart)"
    );
    expect(db.rows()).toEqual([
      { ...blob, id: "row-0" },
      {
        id: "row-1",
        key: "heart",
        d: DEFAULT_SHAPES[3].d,
        order: 20,
        name: { de: "Mein Herz", en: "Heart" },
      },
    ]);
    // Once there, the next fill adds the code's – after them.
    await seedStampShapes(db.payload, "fill");
    expect(db.rows().map((row) => row.key)).toEqual([
      "blob",
      "heart",
      ...DEFAULT_SHAPES.map((shape) => shape.key).filter(
        (key) => key !== "heart"
      ),
    ]);
  });

  it("brings the code's into an empty collection when “Site” had none", async () => {
    const db = fakePayload({}, { globalType: "site", stampShapes: [] });
    expect(await seedStampShapes(db.payload, "fill")).toContain(
      `${DEFAULT_SHAPES.length} added`
    );
  });

  it("never takes over on replace – that is the code's list", async () => {
    const db = fakePayload(
      { "stamp-shapes": [blob] },
      { globalType: "site", stampShapes: [{ ...blob, id: "x" }] }
    );
    await seedStampShapes(db.payload, "replace");
    expect(db.rows().some((row) => row.key === "blob")).toBe(false);
  });
});

describe("the drawing templates' seed", () => {
  it("takes over the templates from “Site” – filled ones filled", async () => {
    const db = fakePayload(
      {},
      {
        globalType: "site",
        drawingTemplates: [
          {
            id: "x",
            key: "moon",
            d: DEFAULT_TEMPLATES[5].d,
            filled: true,
            name: { de: "Mond", en: "Moon" },
          },
        ],
      }
    );
    expect(await seedDrawingTemplates(db.payload, "fill")).toBe(
      "1 taken over from Site (moon)"
    );
    expect(db.rows("drawing-templates")).toEqual([
      {
        id: "row-0",
        key: "moon",
        d: DEFAULT_TEMPLATES[5].d,
        filled: true,
        order: 10,
        name: { de: "Mond", en: "Moon" },
      },
    ]);
  });

  it("fills in the code's templates", async () => {
    const db = fakePayload();
    await seedDrawingTemplates(db.payload, "fill");
    expect(db.rows("drawing-templates").map((row) => row.key)).toEqual(
      DEFAULT_TEMPLATES.map((template) => template.key)
    );
    expect(
      db.rows("drawing-templates").find((row) => row.key === "bolt")?.filled
    ).toBe(true);
  });
});
