/** How wide the pen, the line and the eraser draw – relative to the stamp. */

/**
 * The pen's widths, relative to the stamp – from a hairline (as fine as a
 * 3D printer still prints at 40 mm: half a millimeter) to a marker.
 */
export const WIDTHS = {
  hair: 0.012,
  thin: 0.022,
  medium: 0.036,
  thick: 0.055,
} as const;
export type Width = keyof typeof WIDTHS;
/** The eraser's, one for each – wider: it takes away, it doesn't draw. */
export const ERASERS: Record<Width, number> = {
  hair: 0.02,
  thin: 0.035,
  medium: 0.06,
  thick: 0.1,
};
