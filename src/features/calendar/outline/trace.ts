import type { Point } from "../path";
import type { Field } from "./field";

/**
 * An outline grown or shrunk (outline.ts `grow`): traced along a grid where
 * the distance to the outline is that far, each point then moved right onto
 * that line.
 */

/** How finely it is traced: a grid's cells (unit lengths). */
const STEP = 0.0025;
/** The grid reaches this far round the face each way. */
const MARGIN = 0.3;

const probed = new Float64Array(3);

/**
 * A point moved onto the line where the distance is `level` – straight along
 * the way out, which an exact distance needs once (twice for good measure).
 */
export const onto = (
  field: Field,
  level: number,
  x: number,
  y: number
): Point => {
  let px = x;
  let py = y;
  for (let i = 0; i < 2; i++) {
    field.probe(px, py, probed);
    const d = probed[0] - level;
    if (Math.abs(d) < 1e-10) break;
    px -= d * probed[1];
    py -= d * probed[2];
  }
  return [px, py];
};

/**
 * Where the distance is `level`, traced all round: from where it crosses
 * the line `y` furthest right, clockwise on screen. Cell by cell along a
 * grid, as marching squares do it – only the cells it passes are measured,
 * and it goes round sharp corners and through narrow places as surely as
 * the grid is fine.
 */
export const trace = (field: Field, level: number, y: number): Point[] => {
  const columns = Math.ceil((1 + 2 * MARGIN) / STEP);
  // Grid lines: x from -MARGIN on, and `y` one of the rows.
  const row0 = Math.ceil((y + MARGIN) / STEP);
  const xOf = (i: number) => -MARGIN + i * STEP;
  const yOf = (j: number) => y + (j - row0) * STEP;
  const values = new Map<number, number>();
  const value = (i: number, j: number) => {
    const key = j * (columns + 1) + i;
    let v = values.get(key);
    if (v === undefined) {
      v = field.at(xOf(i), yOf(j)) - level;
      values.set(key, v);
    }
    return v;
  };
  const inside = (i: number, j: number) => value(i, j) < 0;
  // Edges: 0 top, 1 right, 2 bottom, 3 left of a cell – each by its two
  // corners.
  const corners = (i: number, j: number, edge: number): number[] =>
    [
      [i, j, i + 1, j],
      [i + 1, j, i + 1, j + 1],
      [i + 1, j + 1, i, j + 1],
      [i, j + 1, i, j],
    ][edge];
  const crosses = (i: number, j: number, edge: number) => {
    const [ai, aj, bi, bj] = corners(i, j, edge);
    return inside(ai, aj) !== inside(bi, bj);
  };
  const pointOn = (i: number, j: number, edge: number): Point => {
    const [ai, aj, bi, bj] = corners(i, j, edge);
    const va = value(ai, aj);
    const vb = value(bi, bj);
    const t = va / (va - vb);
    return [
      xOf(ai) + (xOf(bi) - xOf(ai)) * t,
      yOf(aj) + (yOf(bj) - yOf(aj)) * t,
    ];
  };
  // The start: walked in from the right along the row `y`, to the first
  // edge with the inside to its left.
  let i = columns - 1;
  while (i > 0 && !(inside(i, row0) && !inside(i + 1, row0))) i--;
  let j = row0;
  // Into the cell below it, entering at its top: going down there, with
  // the inside to the right – clockwise on screen.
  let entry = 0;
  const first = { i, j };
  const points: Point[] = [pointOn(i, j, 0)];
  const STEPS_ROUND = 4 * columns * columns;
  for (let n = 0; n < STEPS_ROUND; n++) {
    const others = [1, 2, 3]
      .map((k) => (entry + k) % 4)
      .filter((edge) => crosses(i, j, edge));
    let exit = others[0];
    if (others.length === 3) {
      // A saddle: which way it goes depends on the middle of the cell.
      const middleIn =
        field.at(xOf(i) + STEP / 2, yOf(j) + STEP / 2) - level < 0;
      const [ai, aj] = corners(i, j, entry);
      const entryStartsIn = inside(ai, aj);
      // Round the corner it is cut from: the outside one where the middle is
      // in, the inside one where it is out.
      exit = middleIn === entryStartsIn ? (entry + 1) % 4 : (entry + 3) % 4;
    }
    if (exit === undefined) break;
    // Over into the next cell.
    if (exit === 0) j--;
    else if (exit === 1) i++;
    else if (exit === 2) j++;
    else i--;
    entry = (exit + 2) % 4;
    // Back where it began: round.
    if (i === first.i && j === first.j && entry === 0) break;
    points.push(pointOn(i, j, entry));
  }
  return points;
};
