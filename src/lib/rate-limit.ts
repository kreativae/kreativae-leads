interface Bucket {
  count: number;
  resetAt: number;
}

const globalForRl = globalThis as typeof globalThis & {
  __kreataeRateLimits?: Map<string, Bucket>;
};

const buckets = globalForRl.__kreataeRateLimits ?? new Map<string, Bucket>();
globalForRl.__kreataeRateLimits = buckets;

/**
 * Simple fixed-window in-memory rate limiter (single-instance production).
 * Returns remaining seconds if limited, or null when allowed.
 */
export function rateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): number | null {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return null;
  }
  b.count += 1;
  if (b.count > maxRequests) {
    return Math.ceil((b.resetAt - now) / 1000);
  }
  return null;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() ?? "127.0.0.1";
}

/** Defense-in-depth CSRF check for same-origin POST/PUT/DELETE JSON calls. */
export function assertSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients (curl etc.) carry no Origin
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return !!host && o.host === host;
  } catch {
    return false;
  }
}
