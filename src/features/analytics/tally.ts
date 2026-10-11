/**
 * Counts values and sorts them by frequency – the one calculation behind
 * every list (devices, sources, actions). Shared by the mail report (server)
 * and the admin (client).
 *
 * Empty values count as “—” instead of disappearing: otherwise the shares
 * would add up to less than the whole and nobody would know why.
 */
export const tally = (
  values: (string | null | undefined)[]
): [string, number][] => {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value || "—";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
};
