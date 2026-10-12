import type { StickerInput } from "./build";
import { buildSticker, disposeSticker, pivot } from "./build";

/** The printed stamp's width in millimeters. */
export const PRINT_MM = 40;

/**
 * The stamp as an STL file for a 3D printer, in millimeters – standing as it
 * stamps: on its rubber, the raised lines on the ground (z = 0), the knob up
 * (+Z). The doodle is mirrored on the rubber, as on any stamp: seen from
 * above, through the stamp, it lies like the drawing (its top towards +Y) –
 * and so does the print it leaves. The parts overlap where they meet;
 * slicers join them.
 */
export const stampStl = async (input: StickerInput): Promise<Blob> => {
  const THREE = await import("three");
  const { STLExporter } = await import(
    "three/examples/jsm/exporters/STLExporter.js"
  );
  const stamp = buildSticker(THREE, input, { mirror: true });
  // Built on its back, the face towards +Z: turned over round its face – a
  // half turn about Y, so nothing is mirrored a second time.
  pivot(stamp, 0);
  stamp.rotation.y = Math.PI;
  stamp.scale.setScalar(PRINT_MM);
  stamp.updateMatrixWorld(true);
  const data = new STLExporter().parse(stamp, { binary: true }) as DataView;
  disposeSticker(stamp);
  return new Blob([data.buffer as ArrayBuffer], { type: "model/stl" });
};

/** A file name from the stamp's name – plain letters only. */
export const stlName = (name: string) =>
  `boop-${
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "stamp"
  }.stl`;
