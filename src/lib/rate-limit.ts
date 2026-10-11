/**
 * A simple rate limit in memory (one container): at most `limit` requests per
 * IP and window. The IP stays in memory for the window, never on disk –
 * nothing about visitors is stored.
 *
 *   const tooMany = rateLimit({ limit: 5, windowMs: 10 * 60 * 1000 });
 *   if (tooMany(clientIp(request))) …
 */
export const rateLimit = ({
  limit,
  windowMs,
}: {
  limit: number;
  windowMs: number;
}) => {
  const hits = new Map<string, number[]>();
  let swept = 0;
  /** True when this request is one too many. */
  return (ip: string, now = Date.now()) => {
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    // Over the limit it isn't noted – so hammering doesn't grow the list.
    const over = recent.length >= limit;
    if (!over) recent.push(now);
    hits.set(ip, recent);
    // Forget whoever has been quiet for a window – at most once per window.
    if (hits.size > 1000 && now - swept > windowMs) {
      swept = now;
      for (const [key, times] of hits) {
        if (times.every((t) => now - t >= windowMs)) hits.delete(key);
      }
    }
    return over;
  };
};

/** The caller's IP as the proxy passes it on (X-Forwarded-For). */
export const clientIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
