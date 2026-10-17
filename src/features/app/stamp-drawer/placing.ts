import type { Selection } from "@/features/calendar/arrange";
import type { Art } from "@/features/calendar/art";

/** Putting art into the drawing: on top of it, picked, moved where it lands. */

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Two drawings in one – what is added comes on top. */
export const joined = (art: Art, added: Art): Art => ({
  strokes: [...art.strokes, ...added.strokes],
  fills: [...art.fills, ...added.fills],
});

/** What `added` became in `joined(art, added)` – to pick it. */
export const addedIn = (art: Art, added: Art): Selection => ({
  strokes: added.strokes.map((_, i) => art.strokes.length + i),
  fills: added.fills.map((_, i) => art.fills.length + i),
});

/** Art moved by (dx, dy) – lines with anchors keep them. */
export const shifted = (art: Art, dx: number, dy: number): Art => {
  const move = (p: readonly number[]) =>
    p.map((v, i) => round(v + (i % 2 ? dy : dx)));
  return {
    strokes: art.strokes.map((s) => ({
      ...s,
      p: move(s.p),
      ...(s.a && { a: move(s.a) }),
    })),
    fills: art.fills.map((f) => ({ ...f, p: f.p.map(move) })),
  };
};
