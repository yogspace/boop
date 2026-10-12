/**
 * A simple rate limit in memory (one container): at most `limit` requests per
 * IP and window. An IP stays in memory for the window – one window after its
 * last counted request it is forgotten, by a timer, also when nobody asks
 * again – and never on disk: nothing about visitors is stored.
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
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Forgets a caller one window from now – a new request moves that on. */
  const forgetLater = (ip: string) => {
    clearTimeout(timers.get(ip));
    const timer = setTimeout(() => {
      hits.delete(ip);
      timers.delete(ip);
    }, windowMs);
    // Waiting to forget must not keep the server from stopping.
    if (typeof timer === "object") timer.unref();
    timers.set(ip, timer);
  };

  /** True when this request is one too many. */
  const tooMany = (ip: string, now = Date.now()) => {
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    // Over the limit it isn't noted – so hammering neither grows the list
    // nor keeps the caller in memory any longer.
    if (recent.length >= limit) return true;
    recent.push(now);
    hits.set(ip, recent);
    forgetLater(ip);
    return false;
  };

  /** How many callers are in memory right now. */
  tooMany.remembered = () => hits.size;
  return tooMany;
};

/** The caller's IP as the proxy passes it on (X-Forwarded-For). */
export const clientIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
