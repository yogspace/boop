/**
 * Pages × devices – the calculation behind the heatmap.
 *
 * Apart from its drawing because there are two: the clickable grid in the
 * admin (admin/visit-matrix.tsx) and the fixed table in the mail report.
 * Both show the same columns, the same “Other” rule, the same order.
 */

/** A single view, reduced to what the matrix needs. */
export type Visit = {
  /** The page's path. */
  page: string;
  /** “mobile · iOS 18 · Safari 18” – class, system and browser as ONE name. */
  device: string;
  /** When (ms). */
  at: number;
};

export type VisitCell = { count: number; lastAt: number };
export type VisitAxis = "page" | "device";

/** The column collecting everything beyond the strongest ones. */
export const OTHER = "Other";

export type VisitMatrixData = {
  columns: string[];
  /** Rows with their total and last view, ordered (and filtered). */
  rows: [string, VisitCell][];
  cell: (row: string, col: string) => VisitCell | undefined;
  columnTotal: (col: string) => VisitCell | undefined;
  /** The largest single value – what the shading is relative to. */
  max: number;
  /** The chosen column, if it (still) exists. */
  activeCol: string | null;
};

/** A device profile's name from a view's three fields. */
export const deviceName = (row: {
  device?: string | null;
  os?: string | null;
  browser?: string | null;
}): string =>
  [row.device, row.os, row.browser].filter(Boolean).join(" · ") || "—";

const bump = (map: Map<string, VisitCell>, key: string, at: number) => {
  const cell = map.get(key) ?? { count: 0, lastAt: 0 };
  cell.count += 1;
  cell.lastAt = Math.max(cell.lastAt, at);
  map.set(key, cell);
};

/** Separator in the cell key – never part of a path or device name. */
const cellKey = (row: string, col: string) => `${row}\u001f${col}`;

/**
 * Builds the grid. The strongest `maxColumns` columns stand alone, the rest
 * becomes “Other” – nobody reads a grid that scrolls sideways at a glance.
 *
 * With `sortCol`: only rows that occur in that column at all, ordered by it.
 * A page this device never opened is no answer to “where was this device”.
 * Ties – and no chosen column – go by the total.
 */
export const buildVisitMatrix = (
  visits: Visit[],
  {
    rowAxis,
    maxColumns = 6,
    sortCol = null,
  }: { rowAxis: VisitAxis; maxColumns?: number; sortCol?: string | null }
): VisitMatrixData => {
  const colAxis: VisitAxis = rowAxis === "page" ? "device" : "page";

  const rowTotals = new Map<string, VisitCell>();
  const colTotals = new Map<string, VisitCell>();
  for (const visit of visits) {
    bump(rowTotals, visit[rowAxis], visit.at);
    bump(colTotals, visit[colAxis], visit.at);
  }

  const ranked = [...colTotals.entries()].sort(
    (a, b) => b[1].count - a[1].count
  );
  const columns = ranked.slice(0, maxColumns).map(([key]) => key);
  const named = new Set(columns);
  if (ranked.length > maxColumns) columns.push(OTHER);

  const cells = new Map<string, VisitCell>();
  const otherTotal = new Map<string, VisitCell>();
  for (const visit of visits) {
    const col = named.has(visit[colAxis]) ? visit[colAxis] : OTHER;
    bump(cells, cellKey(visit[rowAxis], col), visit.at);
    if (col === OTHER) bump(otherTotal, OTHER, visit.at);
  }

  const cell = (row: string, col: string) => cells.get(cellKey(row, col));
  const activeCol = sortCol && columns.includes(sortCol) ? sortCol : null;
  const inCol = (row: string) =>
    activeCol ? (cell(row, activeCol)?.count ?? 0) : 0;

  const rows = [...rowTotals.entries()]
    .filter(([row]) => !activeCol || inCol(row) > 0)
    .sort((a, b) => inCol(b[0]) - inCol(a[0]) || b[1].count - a[1].count);

  return {
    columns,
    rows,
    cell,
    columnTotal: (col) =>
      col === OTHER ? otherTotal.get(OTHER) : colTotals.get(col),
    max: Math.max(...[...cells.values()].map((c) => c.count), 1),
    activeCol,
  };
};

/**
 * How strongly a cell is shaded, 0–1 – by the square root rather than
 * linearly: a 1 next to a 40 would vanish, and the rare views are often the
 * interesting ones.
 */
export const visitShade = (count: number, max: number): number =>
  count > 0 ? Math.sqrt(count / max) : 0;
