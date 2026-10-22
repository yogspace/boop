import type * as Three from "three";
import type { StickerInput } from "./build";
import { buildSticker, disposeSticker, pivot } from "./build";

/** The printed stamp's width in millimeters. */
export const PRINT_MM = 40;

/** The files for a 3D printer: a plain STL, or a Bambu Studio project. */
export type PrintFile = "stl" | "3mf";

/**
 * The stamp as it is printed, in millimeters – standing as it stamps: on
 * its rubber, the raised lines on the ground (z = 0), the knob up (+Z). The
 * doodle is mirrored on the rubber, as on any stamp: seen from above,
 * through the stamp, it lies like the drawing (its top towards +Y) – and so
 * does the print it leaves. The parts overlap where they meet; slicers join
 * them.
 */
const printed = async (input: StickerInput) => {
  const THREE = await import("three");
  const stamp = buildSticker(THREE, input, { mirror: true });
  // Built on its back, the face towards +Z: turned over round its face – a
  // half turn about Y, so nothing is mirrored a second time.
  pivot(stamp, 0);
  stamp.rotation.y = Math.PI;
  stamp.scale.setScalar(PRINT_MM);
  stamp.updateMatrixWorld(true);
  return { THREE, stamp };
};

/** The stamp as an STL file for a 3D printer (`printed`). */
export const stampStl = async (input: StickerInput): Promise<Blob> => {
  const { STLExporter } = await import(
    "three/examples/jsm/exporters/STLExporter.js"
  );
  const { stamp } = await printed(input);
  const data = new STLExporter().parse(stamp, { binary: true }) as DataView;
  disposeSticker(stamp);
  return new Blob([data.buffer as ArrayBuffer], { type: "model/stl" });
};

/** A mesh in millimeters: corners (x, y, z each) and triangles by corner. */
export type PrintMesh = { positions: Float32Array; indices: Uint32Array };

/**
 * The stamp as printed (`printed`) as one mesh whose triangles share their
 * corners – as a 3MF keeps them, and its slicer wants them: closed, edge by
 * edge. Corners closer than a ten-thousandth of a millimeter are one.
 */
export const stampMesh = async (input: StickerInput): Promise<PrintMesh> => {
  const { THREE, stamp } = await printed(input);
  const { mergeVertices } = await import(
    "three/examples/jsm/utils/BufferGeometryUtils.js"
  );
  const positions: number[] = [];
  const indices: number[] = [];
  stamp.traverse((object) => {
    const mesh = object as Three.Mesh;
    if (!mesh.isMesh) return;
    // Its corners alone – normals and the like would keep them apart –, a
    // copy in millimeters (a part may share its geometry with another).
    const plain = new THREE.BufferGeometry();
    plain.setAttribute(
      "position",
      mesh.geometry.getAttribute("position").clone()
    );
    if (mesh.geometry.index) plain.setIndex(mesh.geometry.index);
    plain.applyMatrix4(mesh.matrixWorld);
    const shared = mergeVertices(plain, 1e-4);
    const corners = shared.getAttribute("position");
    const index = shared.index;
    const start = positions.length / 3;
    for (let i = 0; i < corners.count; i++) {
      positions.push(corners.getX(i), corners.getY(i), corners.getZ(i));
    }
    // A mirrored part's triangles turn the other way round – turned back.
    const flip = mesh.matrixWorld.determinant() < 0;
    const count = index ? index.count : corners.count;
    for (let t = 0; t + 2 < count; t += 3) {
      const [a, b, c] = [t, t + 1, t + 2].map((n) =>
        index ? index.getX(n) : n
      );
      // Two corners become one: no triangle any more.
      if (a === b || b === c || c === a) continue;
      if (flip) indices.push(start + a, start + c, start + b);
      else indices.push(start + a, start + b, start + c);
    }
    shared.dispose();
  });
  disposeSticker(stamp);
  return {
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
  };
};

/** A file name from the stamp's name – plain letters only. */
export const printName = (name: string, file: PrintFile) =>
  `boop-${
    name
      .toLowerCase()
      // Umlauts written out, as German does without them: “für” → “fuer”.
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      // Other letters lose their marks: “é” is “e” and its accent.
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "stamp"
  }.${file}`;
