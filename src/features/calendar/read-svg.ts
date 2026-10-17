import { openLocked, paints, SHAPES, unfold, walk } from "./import-svg";
import { boxOfPieces, type Piece } from "./path";
import {
  lengthOf,
  lineOf,
  type Matrix,
  piecesOf,
  type ShapeGeometry,
  type SvgPart,
  transformPieces,
} from "./svg-outline";

/**
 * An uploaded SVG's shapes, as it draws them – for the CMS, which makes a
 * path of them (svg-outline.ts). The file is someone else's code: it is
 * opened in the importer's locked frame (import-svg.ts) – no scripts,
 * nothing loaded, nothing of it in the page.
 *
 * There the browser tells what puts down ink (styles and all) and where each
 * shape lies in the picture – transforms, nested viewBoxes, reused shapes
 * unfolded; the shape's own numbers are read as written, so its curves stay
 * curves. One whose numbers don't come to what the browser draws (a path
 * read otherwise, geometry set by CSS) is walked point by point instead, as
 * the importer does. Text, pictures and effects are left out. Browser only.
 */

/** A file bigger than this (bytes) is refused – an outline is small. */
export const SVG_LIMIT = 1_000_000;

/** How far a shape's numbers may stray from the browser's (share of size). */
const AGREE = 0.015;

/** Hidden, or so faint it doesn't show – the shape or what it is in. */
const hidden = (shape: Element, svg: Element, view: Window) => {
  let opacity = 1;
  for (
    let at: Element | null = shape;
    at && at !== svg;
    at = at.parentElement
  ) {
    const style = view.getComputedStyle(at);
    if (style.display === "none") return true;
    opacity *= Number(style.opacity);
  }
  return view.getComputedStyle(shape).visibility === "hidden" || opacity < 0.05;
};

/** A length the shape has – units and percentages worked out. */
const lengthIn = (shape: Element, name: string) =>
  (shape as unknown as Record<string, SVGAnimatedLength | undefined>)[name]
    ?.baseVal.value ?? 0;

/** A shape's own numbers – as written, before any transform. */
const geometryOf = (shape: SVGGeometryElement): ShapeGeometry | null => {
  const n = (name: string) => lengthIn(shape, name);
  // A rectangle's radius not given: the other one's.
  const radius = (name: string) => {
    const given = shape.getAttribute(name)?.trim();
    return !given || given === "auto" ? null : n(name);
  };
  switch (shape.tagName) {
    case "path":
      return { tag: "path", d: shape.getAttribute("d") ?? "" };
    case "rect":
      return {
        tag: "rect",
        x: n("x"),
        y: n("y"),
        width: n("width"),
        height: n("height"),
        rx: radius("rx"),
        ry: radius("ry"),
      };
    case "circle":
      return { tag: "circle", cx: n("cx"), cy: n("cy"), r: n("r") };
    case "ellipse":
      return {
        tag: "ellipse",
        cx: n("cx"),
        cy: n("cy"),
        rx: n("rx"),
        ry: n("ry"),
      };
    case "line":
      return {
        tag: "line",
        x1: n("x1"),
        y1: n("y1"),
        x2: n("x2"),
        y2: n("y2"),
      };
    case "polyline":
    case "polygon": {
      const list = (shape as SVGPolylineElement).points;
      const points: number[] = [];
      for (let i = 0; i < list.numberOfItems; i++) {
        const point = list.getItem(i);
        points.push(point.x, point.y);
      }
      return { tag: shape.tagName, points };
    }
  }
  return null;
};

/**
 * Whether pieces are what the browser draws: a path as long, a basic shape
 * in the same box – near enough. (Some browsers measure a circle's or a
 * rounded corner's length only roughly; its box they know exactly.)
 */
const agrees = (pieces: Piece[], shape: SVGGeometryElement) => {
  try {
    if (shape.tagName === "path") {
      const theirs = shape.getTotalLength();
      const ours = lengthOf(pieces);
      return Math.abs(ours - theirs) <= AGREE * Math.max(ours, theirs) + 1e-9;
    }
    const { x, y, width, height } = shape.getBBox();
    const ours = boxOfPieces(pieces);
    const near = AGREE * Math.max(width, height) + 1e-9;
    return [
      ours.x0 - x,
      ours.y0 - y,
      ours.x1 - (x + width),
      ours.y1 - (y + height),
    ].every((off) => Math.abs(off) <= near);
  } catch {
    return false;
  }
};

const matrixOf = (m: DOMMatrix): Matrix => [m.a, m.b, m.c, m.d, m.e, m.f];

/** How much a matrix sizes things. */
const zoomOf = (m: DOMMatrix) => Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));

/**
 * The file's shapes that put down ink, in the picture's own units (its
 * viewBox's) – an empty list when it has none, null when it is no SVG.
 */
export const readSvg = async (text: string): Promise<SvgPart[] | null> => {
  const opened = await openLocked(text);
  if (!opened) return null;
  const { doc, close } = opened;
  try {
    const svg = doc.querySelector<SVGSVGElement>("body > svg");
    const view = doc.defaultView;
    const screen = svg?.getScreenCTM();
    if (!(svg && view && screen)) return null;
    unfold(svg);
    // From the frame back into the picture's units.
    const back = screen.inverse();
    const parts: SvgPart[] = [];
    for (const shape of svg.querySelectorAll<SVGGeometryElement>(SHAPES)) {
      // Only what is drawn – not patterns for clipping, masks or reuse.
      if (shape.closest("defs,clipPath,mask,pattern,symbol,marker")) continue;
      if (hidden(shape, svg, view)) continue;
      const onScreen = shape.getScreenCTM();
      if (!onScreen) continue;
      const matrix = back.multiply(onScreen);
      const style = view.getComputedStyle(shape);
      const filled =
        shape.tagName !== "line" && paints(style.fill, style.fillOpacity);
      const line = paints(style.stroke, style.strokeOpacity)
        ? (Number.parseFloat(style.strokeWidth) || 1) * zoomOf(matrix)
        : 0;
      if (!(filled || line)) continue;
      const geometry = geometryOf(shape);
      const own = geometry && piecesOf(geometry);
      if (own && agrees(own, shape)) {
        parts.push({
          pieces: transformPieces(own, matrixOf(matrix)),
          filled,
          line,
        });
        continue;
      }
      // Its numbers don't tell: its points, as the browser draws them.
      const rings = walk(shape, onScreen, zoomOf(onScreen));
      if (!rings.length) continue;
      parts.push({
        pieces: transformPieces(
          rings.map((ring) => lineOf(ring.points, ring.closed)),
          matrixOf(back)
        ),
        filled,
        line,
        walked: true,
      });
    }
    return parts;
  } finally {
    close();
  }
};
