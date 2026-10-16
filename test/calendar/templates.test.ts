import { describe, expect, it } from "vitest";
import { ANCHOR } from "../../src/features/calendar/bezier";
import { cleanDrawing } from "../../src/features/calendar/model";
import {
  cleanTemplates,
  DEFAULT_TEMPLATES,
  templateArt,
} from "../../src/features/calendar/templates";

const at = { x: 0.5, y: 0.5, size: 0.4, width: 0.022 };

const extent = (values: number[]) => Math.max(...values) - Math.min(...values);

describe("the drawing templates", () => {
  it("are a dozen doodles or so, every one drawing something", () => {
    expect(DEFAULT_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_TEMPLATES.length).toBeLessThanOrEqual(14);
    for (const template of DEFAULT_TEMPLATES) {
      const art = templateArt(template, at);
      expect(
        art.strokes.length + art.fills.length,
        template.key
      ).toBeGreaterThan(0);
    }
  });

  it("land as lines with their anchors, the pen's width, the size asked for", () => {
    const art = templateArt(
      DEFAULT_TEMPLATES.find((t) => t.key === "heart") ?? DEFAULT_TEMPLATES[0],
      at
    );
    expect(art.fills).toEqual([]);
    expect(art.strokes).toHaveLength(1);
    const [heart] = art.strokes;
    expect(heart.w).toBe(at.width);
    expect(heart.closed).toBe(true);
    expect((heart.a?.length ?? 0) / ANCHOR).toBeGreaterThan(3);
    const xs = heart.p.filter((_, i) => i % 2 === 0);
    const ys = heart.p.filter((_, i) => i % 2 === 1);
    expect(Math.max(extent(xs), extent(ys))).toBeCloseTo(at.size, 2);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(0.5, 2);
    // Kept as they are by a device's drawing being checked.
    expect(cleanDrawing({ v: 1, strokes: art.strokes })?.strokes).toEqual(
      art.strokes
    );
  });

  it("land filled as one area, holes where pieces overlap; open lines stay lines", () => {
    const moon = templateArt(
      DEFAULT_TEMPLATES.find((t) => t.key === "moon") ?? DEFAULT_TEMPLATES[0],
      at
    );
    expect(moon.strokes).toEqual([]);
    expect(moon.fills).toHaveLength(1);
    expect(moon.fills[0].rule).toBe("evenodd");
    const flower = templateArt(
      { d: "M0 0H10V10H0ZM3 3H7V7H3ZM12 0L20 10", filled: true },
      at
    );
    expect(flower.fills[0].p).toHaveLength(2);
    expect(flower.strokes).toHaveLength(1);
    expect(flower.strokes[0].closed).toBeUndefined();
  });

  it("move in to lie on the face, dropped at its edge", () => {
    const art = templateArt(DEFAULT_TEMPLATES[0], { ...at, x: 0.98, y: 0.02 });
    for (const stroke of art.strokes) {
      for (const v of stroke.p) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it("are checked as they come from the CMS", () => {
    const clean = cleanTemplates([
      { key: "dot", name: "Dot", d: "M0 0L1 1", filled: "yes" },
      { key: "dot", name: "Twice", d: "M0 0L1 1" },
      { key: "nope", name: "Nope", d: "hello" },
      { key: "Bad", d: "M0 0L1 1" },
    ]);
    expect(clean).toEqual([
      {
        key: "dot",
        name: { de: "Dot", en: "Dot" },
        d: "M0 0L1 1",
        filled: false,
      },
    ]);
  });
});
