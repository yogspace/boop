// Renders public/icon.svg into the PNG icons in public/icons/ – the web
// manifest's, and Apple's home screen icon. Run after changing the SVG:
//
//   node scripts/icons.mjs
//
// The SVG is a rounded white tile; where the system rounds the corners
// itself (Apple, “maskable” on Android) the tile goes edge to edge – the
// mark stays inside the maskable safe zone (the middle 80 %) either way.
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const svg = await readFile(
  new URL("../public/icon.svg", import.meta.url),
  "utf8"
);
const square = svg.replace(/ rx="\d+"/, "");
const icons = [
  ["icon-192.png", 192, svg],
  ["icon-512.png", 512, svg],
  ["maskable-512.png", 512, square],
  ["apple-touch-icon.png", 180, square],
];

for (const [name, size, source] of icons) {
  const target = new URL(`../public/icons/${name}`, import.meta.url);
  await sharp(Buffer.from(source), { density: ((72 * size) / 512) * 2 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(target.pathname);
  console.info(`✓ public/icons/${name}`);
}
