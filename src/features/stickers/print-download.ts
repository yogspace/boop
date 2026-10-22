import type { StickerInput } from "./build";
import { stampThreeMf } from "./export-3mf";
import { type PrintFile, printName, stampStl } from "./export-stl";
import { stickerImage } from "./render";

/** The stamp's picture as a PNG (render.ts) – none without WebGL. */
const pictureOf = async (input: StickerInput) => {
  try {
    const response = await fetch(await stickerImage(input));
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
};

/**
 * The stamp as a file for a 3D printer, downloaded: a plain STL, or a
 * Bambu Studio project ready to slice, its picture as the thumbnail.
 */
export const downloadPrint = async (
  input: StickerInput,
  name: string,
  file: PrintFile
) => {
  const blob =
    file === "stl"
      ? await stampStl(input)
      : await stampThreeMf(
          input,
          name.trim() || "boop",
          await pictureOf(input)
        );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = printName(name, file);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
