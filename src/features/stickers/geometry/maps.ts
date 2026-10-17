// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { FACE } from "../../calendar/model";
import { outlinePoints, rimLine } from "../../calendar/outline";
import type { ShapeLike } from "../../calendar/shapes";
import type { StickerInput } from "../build";
import { pointsOf } from "./outlines";

/**
 * Height maps – drawn on a canvas in the unit square, read back smooth in
 * the model's units: the rubber's face (the drawing's relief) and the
 * plate's engraving. The surfaces are built on them (slab.ts).
 */

/** Resolution of the height maps the surfaces are read from. */
const MAP = 512;
/** How far (map px) the face's `core` blurs: about half a line's width. */
const CORE = 6;

/** Softens a height map a little – the walls slope like cut rubber. */
const soften = (data: Float32Array, passes = 2) => {
  const out = new Float32Array(data.length);
  for (let n = 0; n < passes; n++) {
    for (let y = 0; y < MAP; y++) {
      const row = y * MAP;
      for (let x = 0; x < MAP; x++) {
        const l = data[row + Math.max(0, x - 1)];
        const r = data[row + Math.min(MAP - 1, x + 1)];
        out[row + x] = (l + data[row + x] + r) / 3;
      }
    }
    for (let y = 0; y < MAP; y++) {
      const up = Math.max(0, y - 1) * MAP;
      const down = Math.min(MAP - 1, y + 1) * MAP;
      for (let x = 0; x < MAP; x++) {
        data[y * MAP + x] =
          (out[up + x] + out[y * MAP + x] + out[down + x]) / 3;
      }
    }
  }
  return data;
};

/**
 * Blurs a map far – a box `radius` px wide each way, three times over, the
 * sums running along. What stood raised fades towards its edges: deep inside
 * a line it is still 1, at its edge about half.
 */
const blur = (data: Float32Array, radius: number) => {
  const out = new Float32Array(data.length);
  const width = 2 * radius + 1;
  // Along a row or a column (`step` apart), from `from` on.
  const line = (
    from: Float32Array,
    to: Float32Array,
    at: number,
    step: number
  ) => {
    const read = (i: number) =>
      from[at + Math.min(MAP - 1, Math.max(0, i)) * step];
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += read(i);
    for (let i = 0; i < MAP; i++) {
      to[at + i * step] = sum / width;
      sum += read(i + radius + 1) - read(i - radius);
    }
  };
  for (let n = 0; n < 3; n++) {
    for (let y = 0; y < MAP; y++) line(data, out, y * MAP, 1);
    for (let x = 0; x < MAP; x++) line(out, data, x, MAP);
  }
  return data;
};

/**
 * A map drawn on a canvas in the unit square (0–1, y down, like the
 * drawing): white is 1, black 0.
 */
const drawMap = (draw: (ctx: CanvasRenderingContext2D) => void) => {
  const canvas = document.createElement("canvas");
  canvas.width = MAP;
  canvas.height = MAP;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const data = new Float32Array(MAP * MAP);
  if (!ctx) return data;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, MAP, MAP);
  ctx.scale(MAP, MAP);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  draw(ctx);
  const pixels = ctx.getImageData(0, 0, MAP, MAP).data;
  for (let i = 0; i < data.length; i++) data[i] = pixels[i * 4] / 255;
  return data;
};

/** A map read back in local units (−0.5…0.5, y up) – bilinear, smooth. */
const sampler = (data: Float32Array) => {
  const at = (x: number, y: number) =>
    data[
      Math.min(MAP - 1, Math.max(0, y)) * MAP +
        Math.min(MAP - 1, Math.max(0, x))
    ];
  return (x: number, y: number) => {
    const fx = (x + 0.5) * MAP - 0.5;
    const fy = (0.5 - y) * MAP - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
};

/** A height map, softened – the walls run smooth. */
export const heightMap = (draw: (ctx: CanvasRenderingContext2D) => void) =>
  sampler(soften(drawMap(draw)));

/** The shape's outline as a canvas path, in the unit square. */
const tracePath = (
  ctx: CanvasRenderingContext2D,
  shape: ShapeLike,
  grow: number
) => {
  ctx.beginPath();
  outlinePoints(shape, grow, pointsOf(shape)).forEach(([x, y], i) => {
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
};

/**
 * The face's relief, exactly as the drawing shows it (stamp-svg.tsx): the
 * rim along the outline (or its pattern – the same lines, rimLine) and the
 * doodle – the same smoothing – clipped to it. An inverted stamp is the
 * other way round: the whole face stands, the doodle and the rim's pattern
 * are cut into it. Mirrored for printing: a real stamp's face reads
 * the other way round.
 *
 * And how deep inside what stands a spot lies (`core`): 1 well inside a line
 * or an area, about half at its edge – for a finish that follows the lines
 * (toon/finishes.ts).
 */
export const faceMap = (input: StickerInput, mirror: boolean) => {
  const raw = drawMap((ctx) => {
    if (mirror) {
      ctx.translate(1, 0);
      ctx.scale(-1, 1);
    }
    const inverted = Boolean(input.drawing?.inverted);
    const pattern = input.drawing?.rim;
    // The rim: everything outside its inner edge – or all of it.
    if (inverted || !pattern) ctx.fillRect(0, 0, 1, 1);
    if (!(inverted || pattern)) {
      ctx.fillStyle = "#000";
      tracePath(ctx, input.shape, -FACE.rim / 2);
      ctx.fill();
    }
    if (pattern) {
      // A patterned one: just its pattern – or that cut into the face.
      const rim = rimLine(input.shape, pattern, { cut: inverted });
      ctx.save();
      ctx.strokeStyle = inverted ? "#000" : "#fff";
      ctx.lineWidth = rim.width;
      ctx.lineCap = rim.cap;
      ctx.stroke(new Path2D(rim.d));
      ctx.restore();
    }
    // The doodle stands out of the ground – or is cut into the face.
    ctx.fillStyle = inverted ? "#000" : "#fff";
    ctx.strokeStyle = ctx.fillStyle;
    tracePath(ctx, input.shape, 0);
    ctx.clip();
    for (const fill of input.drawing?.fills ?? []) {
      ctx.beginPath();
      for (const ring of fill.p) {
        for (let i = 0; i + 1 < ring.length; i += 2) {
          if (i) ctx.lineTo(ring[i], ring[i + 1]);
          else ctx.moveTo(ring[i], ring[i + 1]);
        }
        ctx.closePath();
      }
      ctx.fill(fill.rule ?? "nonzero");
    }
    for (const stroke of input.drawing?.strokes ?? []) {
      const p = stroke.p;
      if (p.length < 2) continue;
      ctx.lineWidth = stroke.w;
      const x1 = p[p.length - 2];
      const y1 = p[p.length - 1];
      if (p.length < 6) {
        // A dot or a short line.
        if (x1 === p[0] && y1 === p[1]) {
          ctx.beginPath();
          ctx.arc(x1, y1, stroke.w / 2, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length - 2; i += 2) {
        ctx.quadraticCurveTo(
          p[i],
          p[i + 1],
          (p[i] + p[i + 2]) / 2,
          (p[i + 1] + p[i + 3]) / 2
        );
      }
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  });
  return {
    core: sampler(blur(raw.slice(), CORE)),
    relief: sampler(soften(raw)),
  };
};
