import type { PayloadRequest } from "payload";
import { describe, expect, it } from "vitest";
import { DEFAULT_SHAPES } from "../../src/features/calendar/shapes";
import { DEFAULT_TEMPLATES } from "../../src/features/calendar/templates";
import {
  inOrder,
  shapeKeysNow,
  shapesFrom,
  stampShapesNow,
} from "../../src/features/site/stamp-shapes";

const TRIANGLE = "M0 0L10 0L5 10Z";

/** The collections as Payload answers with locale "all" – in any order. */
const payloadWith = (docs: Record<string, unknown[]>, down = false) => ({
  find: async ({ collection }: { collection: string }) => {
    if (down) throw new Error("No database.");
    return { docs: docs[collection] ?? [] };
  },
});

const request = (docs: Record<string, unknown[]>, down = false) =>
  ({ payload: payloadWith(docs, down) }) as unknown as PayloadRequest;

describe("the shapes from their collections", () => {
  it("come in their order – one without a place last, the same place by age", () => {
    const docs = [
      { key: "c", order: null, createdAt: "2026-01-01" },
      { key: "b", order: 20, createdAt: "2026-01-03" },
      { key: "a", order: 20, createdAt: "2026-01-02" },
      { key: "z", order: 5, createdAt: "2026-01-09" },
    ];
    expect(inOrder(docs).map((doc) => doc.key)).toEqual(["z", "a", "b", "c"]);
  });

  it("are the CMS's, checked, names in each language – the first the default", async () => {
    const req = request({
      "stamp-shapes": [
        {
          key: "blob",
          d: TRIANGLE,
          order: 20,
          name: { de: "Klecks", en: "Blob" },
        },
        {
          key: "heart",
          d: DEFAULT_SHAPES[3].d,
          order: 10,
          name: { de: "Herz" },
        },
        { key: "line", d: "M0 0L10 10", order: 30, name: { de: "Strich" } },
      ],
    });
    const shapes = await stampShapesNow(req);
    expect(shapes.map((shape) => shape.key)).toEqual(["heart", "blob"]);
    expect(shapes[0].name).toEqual({ de: "Herz", en: "Heart" });
    // A stamp may be in any of them – or in one the code knows.
    const keys = await shapeKeysNow(req);
    expect(keys.slice(0, 2)).toEqual(["heart", "blob"]);
    expect(keys).toEqual(
      expect.arrayContaining(DEFAULT_SHAPES.map((shape) => shape.key))
    );
    expect(keys).not.toContain("line");
  });

  it("are the code's while the collections are empty – or out of reach", async () => {
    expect(await stampShapesNow(request({}))).toEqual(DEFAULT_SHAPES);
    expect(await stampShapesNow(request({}, true))).toEqual(DEFAULT_SHAPES);
    const both = await shapesFrom(payloadWith({}) as never);
    expect(both).toEqual({
      stampShapes: DEFAULT_SHAPES,
      drawingTemplates: DEFAULT_TEMPLATES,
    });
  });

  it("bring the templates the same way – filled ones filled", async () => {
    const { drawingTemplates } = await shapesFrom(
      payloadWith({
        "drawing-templates": [
          { key: "dot", d: TRIANGLE, filled: true, order: 1, name: "Punkt" },
        ],
      }) as never
    );
    expect(drawingTemplates).toEqual([
      {
        key: "dot",
        d: TRIANGLE,
        filled: true,
        name: { de: "Punkt", en: "Punkt" },
      },
    ]);
  });

  it("throw for the pages' cache while the database is out of reach – it takes the code's then, and asks again soon", async () => {
    await expect(shapesFrom(payloadWith({}, true) as never)).rejects.toThrow();
  });
});
