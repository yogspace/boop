import { strFromU8, unzipSync } from "fflate";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { hexOf } from "../../src/features/calendar/palette";
import type { StickerInput } from "../../src/features/stickers/build";
import { stampThreeMf } from "../../src/features/stickers/export-3mf";
import { PRINT_MM, printName } from "../../src/features/stickers/export-stl";
import { fakeCanvas } from "./fake-canvas";

const stamp = (shape: string): StickerInput => ({
  shape,
  color: "red",
  drawing: { strokes: [{ w: 0.08, p: [0.3, 0.3, 0.7, 0.7] }] },
});

/** The project's files, by path. */
const unpack = async (file: Blob) =>
  unzipSync(new Uint8Array(await file.arrayBuffer()));

/** A transform's shift: the last three of its twelve numbers. */
const shift = (text: string, tag: string) => {
  const found = text.match(
    new RegExp(
      `<${tag} [^>]*transform="1 0 0 0 1 0 0 0 1 ([^ ]+) ([^ ]+) ([^"]+)"`
    )
  );
  if (!found) throw new Error(`No ${tag}`);
  return found.slice(1).map(Number);
};

describe("a stamp as a Bambu Studio project", () => {
  beforeAll(() => {
    vi.stubGlobal("document", { createElement: fakeCanvas });
  });

  it("is closed and stands on the plate's middle", async () => {
    const files = await unpack(await stampThreeMf(stamp("circle"), "Herz"));
    const object = strFromU8(files["3D/Objects/object_1.model"]);
    const corners = [
      ...object.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g),
    ].map((found) => found.slice(1).map(Number));
    const triangles = [
      ...object.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g),
    ].map((found) => found.slice(1).map(Number));
    expect(triangles.length).toBeGreaterThan(1000);

    // Its triangles share their corners: every edge is walked once each
    // way – the slicer finds nothing open.
    const edges = new Map<string, number>();
    const walk = (a: number, b: number) =>
      edges.set(`${a},${b}`, (edges.get(`${a},${b}`) ?? 0) + 1);
    for (const [a, b, c] of triangles) {
      expect(new Set([a, b, c]).size).toBe(3);
      walk(a, b);
      walk(b, c);
      walk(c, a);
    }
    const open = [...edges].filter(([edge, times]) => {
      const [a, b] = edge.split(",");
      return edges.get(`${b},${a}`) !== times;
    });
    expect(open).toEqual([]);

    // On the plate: its rubber on it, in the middle, as wide as promised.
    const model = strFromU8(files["3D/3dmodel.model"]);
    const [px, py, pz] = shift(model, "component");
    const [ix, iy, iz] = shift(model, "item");
    const placed = corners.map(([x, y, z]) => [
      x + px + ix,
      y + py + iy,
      z + pz + iz,
    ]);
    const span = (axis: number) => {
      const values = placed.map((corner) => corner[axis]);
      return [Math.min(...values), Math.max(...values)];
    };
    expect(span(2)[0]).toBeCloseTo(0, 3);
    for (const axis of [0, 1]) {
      expect(span(axis)[0]).toBeCloseTo(128 - PRINT_MM / 2, 1);
      expect(span(axis)[1]).toBeCloseTo(128 + PRINT_MM / 2, 1);
    }
  });

  it("is set up for an A1 in the stamp's color, supported from the plate", async () => {
    const files = await unpack(
      await stampThreeMf(stamp("square"), "Herz & <Sonne>")
    );
    const settings = JSON.parse(
      strFromU8(files["Metadata/project_settings.config"])
    );
    expect(settings.printer_model).toBe("Bambu Lab A1");
    expect(settings.filament_colour).toEqual([hexOf("red").toUpperCase()]);
    expect(settings.enable_support).toBe("1");
    expect(settings.support_on_build_plate_only).toBe("1");
    expect(strFromU8(files["3D/3dmodel.model"])).toContain(
      `<metadata name="Title">Herz &amp; &lt;Sonne&gt;</metadata>`
    );
    // Without a picture, no thumbnails – and none named.
    expect(files["Metadata/plate_1.png"]).toBeUndefined();
    expect(strFromU8(files["_rels/.rels"])).not.toContain("plate_1.png");
  });

  it("takes the stamp's picture as its thumbnail", async () => {
    const picture = new Uint8Array([137, 80, 78, 71]);
    const files = await unpack(
      await stampThreeMf(stamp("circle"), "Herz", picture)
    );
    expect(files["Metadata/plate_1.png"]).toEqual(picture);
    expect(files["Metadata/plate_1_small.png"]).toEqual(picture);
    expect(strFromU8(files["_rels/.rels"])).toContain("plate_1.png");
  });

  it("is named like the stamp", () => {
    expect(printName("Herz für Oma", "3mf")).toBe("boop-herz-fuer-oma.3mf");
    expect(printName("Äpfel, Öl & Grüße", "stl")).toBe(
      "boop-aepfel-oel-gruesse.stl"
    );
    expect(printName("Café", "stl")).toBe("boop-cafe.stl");
    expect(printName("", "stl")).toBe("boop-stamp.stl");
  });
});
