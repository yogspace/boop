/**
 * Numbers that look random but come again for the same seed – a print's
 * finish and glitter (stamp-svg.tsx) are the same every time it is drawn.
 */
export const random = (seed: number) => {
  let state = Math.imul(seed + 1, 2654435761) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
