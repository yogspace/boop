import type { StickerInput } from "./build";
import { buildSticker, disposeSticker } from "./build";

/** The printed stamp's width in millimeters. */
export const PRINT_MM = 40;

/**
 * The stamp as an STL file for a 3D printer – rubber face up, the doodle
 * mirrored (so the print reads the right way), in millimeters. The parts
 * overlap where they meet; slicers join them.
 */
export const stampStl = async (input: StickerInput): Promise<Blob> => {
  const THREE = await import("three");
  const { STLExporter } = await import(
    "three/examples/jsm/exporters/STLExporter.js"
  );
  const stamp = buildSticker(THREE, input, { mirror: true });
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
