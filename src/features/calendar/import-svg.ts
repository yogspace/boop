import { DRAWING_LIMITS, type Fill, type Stroke } from "./model";

/**
 * A picture as a stamp: an uploaded SVG's shapes become a drawing – what is
 * filled becomes fills, what is outlined strokes – fit into the middle of
 * the stamp's face. Colors go: a stamp has one.
 *
 * The file is someone else's code, so it is only ever looked at inside a
 * locked frame: no scripts, nothing loaded (sandbox and a content policy),
 * its styles kept to itself. There the browser tells where every shape
 * really lies – transforms, units, styles and all – and its outline is
 * walked point by point. Text, pictures and effects are left out. Browser
 * only.
 */

export type Imported = { strokes: Stroke[]; fills: Fill[] };

/** The drawing's box on the face – a little air to the rim all around. */
const BOX = { at: 0.17, size: 0.66 };
/** Steps an outline is walked in – before it is thinned out again. */
const WALK = 400;
/** Points closer to the line through their neighbors than this go. */
const TOLERANCE = 0.0025;
/** Points the whole picture may keep – room is left for drawing on top. */
const BUDGET = DRAWING_LIMITS.points * 0.75;
/** A file that takes longer than this to open is given up on. */
const PATIENCE_MS = 4000;

const SHAPES = "path,rect,circle,ellipse,line,polyline,polygon";

type Point = [number, number];
type Ring = { points: Point[]; closed: boolean };

const round = (n: number) => Math.round(n * 1000) / 1000;

/** The file in a locked frame – its document once it has laid itself out. */
const openLocked = (text: string) =>
  new Promise<{ doc: Document; close: () => void } | null>((resolve) => {
    const frame = document.createElement("iframe");
    // Same origin, so its shapes can be measured – but no scripts at all.
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText =
      "position:fixed;left:-9999px;top:0;width:1000px;height:1000px;border:0;visibility:hidden;pointer-events:none";
    const close = () => frame.remove();
    const timer = setTimeout(() => {
      close();
      resolve(null);
    }, PATIENCE_MS);
    frame.addEventListener("load", () => {
      clearTimeout(timer);
      const doc = frame.contentDocument;
      if (doc) resolve({ doc, close });
      else {
        close();
        resolve(null);
      }
    });
    frame.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>html,body{margin:0}svg{display:block;width:1000px;height:1000px}</style>${text}`;
    document.body.appendChild(frame);
  });

/** Whether a paint (fill or stroke) puts down ink at all. */
const paints = (paint: string, opacity: string) =>
  paint !== "none" && paint !== "transparent" && Number(opacity) > 0.05;

/**
 * A shape's outline, walked: its points on the page, cut wherever the pen
 * was lifted (a path may hold several outlines).
 */
const walk = (shape: SVGGeometryElement): Ring[] => {
  const matrix = shape.getScreenCTM();
  let length = 0;
  try {
    length = shape.getTotalLength();
  } catch {
    return [];
  }
  if (!(matrix && length > 0 && Number.isFinite(length))) return [];
  const step = length / WALK;
  const rings: Ring[] = [];
  let ring: Point[] = [];
  let last: DOMPoint | null = null;
  const done = () => {
    if (ring.length > 1) {
      const [x0, y0] = ring[0];
      const [x1, y1] = ring[ring.length - 1];
      rings.push({
        points: ring,
        closed: Math.hypot(x1 - x0, y1 - y0) <= step * 1.5,
      });
    }
    ring = [];
  };
  for (let i = 0; i <= WALK; i++) {
    const at = shape.getPointAtLength(Math.min(length, i * step));
    // Further than a step from the last point: the pen jumped.
    if (last && Math.hypot(at.x - last.x, at.y - last.y) > step * 1.5) done();
    last = at;
    const on = at.matrixTransform(matrix);
    ring.push([on.x, on.y]);
  }
  done();
  return rings;
};

/** How far a point lies from the line through two others. */
const off = ([x, y]: Point, [ax, ay]: Point, [bx, by]: Point) => {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (!length) return Math.hypot(x - ax, y - ay);
  return Math.abs(dy * x - dx * y + bx * ay - by * ax) / length;
};

/** The points that give an outline its form (Douglas–Peucker). */
const thin = (points: Point[], tolerance: number): Point[] => {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const todo: [number, number][] = [[0, points.length - 1]];
  while (todo.length) {
    const [from, to] = todo.pop() as [number, number];
    let far = 0;
    let index = -1;
    for (let i = from + 1; i < to; i++) {
      const d = off(points[i], points[from], points[to]);
      if (d > far) {
        far = d;
        index = i;
      }
    }
    if (index > 0 && far > tolerance) {
      keep[index] = 1;
      todo.push([from, index], [index, to]);
    }
  }
  return points.filter((_, i) => keep[i]);
};

const flat = (points: Point[]) =>
  points.flatMap(([x, y]) => [round(x), round(y)]);

/**
 * The picture as strokes and fills – or null when the file holds nothing a
 * stamp could show (no shapes, or not an SVG at all).
 */
export const importSvg = async (text: string): Promise<Imported | null> => {
  const opened = await openLocked(text);
  if (!opened) return null;
  const { doc, close } = opened;
  try {
    const svg = doc.querySelector("svg");
    const view = doc.defaultView;
    if (!(svg && view)) return null;
    const pieces: {
      rings: Ring[];
      filled: boolean;
      rule?: "evenodd";
      line: number;
    }[] = [];
    for (const shape of svg.querySelectorAll<SVGGeometryElement>(SHAPES)) {
      // Only what is drawn – not patterns for clipping, masks or reuse.
      if (shape.closest("defs,clipPath,mask,pattern,symbol,marker")) continue;
      const style = view.getComputedStyle(shape);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (Number(style.opacity) < 0.05) continue;
      const filled =
        shape.tagName !== "line" && paints(style.fill, style.fillOpacity);
      const matrix = shape.getScreenCTM();
      // The line's width as it shows, scaled along with the shape.
      const scale = matrix
        ? Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c))
        : 1;
      const line = paints(style.stroke, style.strokeOpacity)
        ? (Number.parseFloat(style.strokeWidth) || 1) * scale
        : 0;
      if (!(filled || line)) continue;
      const rings = walk(shape);
      if (!rings.length) continue;
      pieces.push({
        rings,
        filled,
        ...(style.fillRule === "evenodd" && { rule: "evenodd" as const }),
        line,
      });
    }
    if (!pieces.length) return null;

    // Everything's box – lines counted with their width.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const piece of pieces) {
      const half = piece.line / 2;
      for (const ring of piece.rings) {
        for (const [x, y] of ring.points) {
          minX = Math.min(minX, x - half);
          minY = Math.min(minY, y - half);
          maxX = Math.max(maxX, x + half);
          maxY = Math.max(maxY, y + half);
        }
      }
    }
    const span = Math.max(maxX - minX, maxY - minY);
    if (!(span > 0 && Number.isFinite(span))) return null;
    const scale = BOX.size / span;
    const dx = BOX.at + (BOX.size - (maxX - minX) * scale) / 2 - minX * scale;
    const dy = BOX.at + (BOX.size - (maxY - minY) * scale) / 2 - minY * scale;
    const place = ([x, y]: Point): Point => [x * scale + dx, y * scale + dy];

    // Thinned until the whole picture fits the budget.
    let tolerance = TOLERANCE;
    for (let attempt = 0; attempt < 8; attempt++) {
      const strokes: Stroke[] = [];
      const fills: Fill[] = [];
      let points = 0;
      for (const piece of pieces) {
        const rings = piece.rings.map((ring) => ({
          ...ring,
          points: thin(ring.points.map(place), tolerance),
        }));
        if (piece.filled) {
          const p = rings
            .filter((ring) => ring.points.length > 2)
            .map((ring) => flat(ring.points));
          if (p.length) {
            fills.push({ p, ...(piece.rule && { rule: piece.rule }) });
            points += p.reduce((sum, ring) => sum + ring.length / 2, 0);
          }
        }
        if (piece.line) {
          const w = Math.min(Math.max(round(piece.line * scale), 0.008), 0.2);
          for (const ring of rings) {
            // A closed outline ends where it began.
            const line = ring.closed
              ? [...ring.points, ring.points[0]]
              : ring.points;
            strokes.push({ w, p: flat(line) });
            points += line.length;
          }
        }
      }
      const fits =
        points <= BUDGET &&
        strokes.length <= DRAWING_LIMITS.strokes &&
        fills.length <= DRAWING_LIMITS.fills;
      if (fits) return strokes.length || fills.length ? { strokes, fills } : null;
      tolerance *= 1.7;
    }
    return null;
  } finally {
    close();
  }
};
