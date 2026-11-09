export const UA = "Hang/0.1 (educational art-curation project; contact via GitHub)";

/** Exponential backoff with full jitter: random in [0, base * 2^attempt], capped. */
export function backoffDelay(attempt: number, baseMs = 500, capMs = 30_000, rand: () => number = Math.random): number {
  return Math.floor(rand() * Math.min(capMs, baseMs * 2 ** attempt));
}

export function parseRetryAfter(h: string | null, now = Date.now()): number | null {
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(h);
  return Number.isNaN(when) ? null : Math.max(0, when - now);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type RetryOptions = {
  retries?: number;
  baseMs?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
};

/** Retries network errors, 429 and 5xx. Honours Retry-After. Other 4xx fail fast. */
export async function fetchWithRetry(url: string, opts: RetryOptions = {}): Promise<Response> {
  const { retries = 5, baseMs = 500, headers = {}, fetchImpl = fetch, sleepImpl = sleep } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, { headers: { "User-Agent": UA, ...headers } });
      if (res.ok) return res;
      if (res.status !== 429 && res.status < 500) throw new HttpError(res.status, url);
      lastErr = new HttpError(res.status, url);
      if (attempt < retries) await sleepImpl(parseRetryAfter(res.headers.get("retry-after")) ?? backoffDelay(attempt, baseMs));
    } catch (e) {
      if (e instanceof HttpError && e.status !== 429 && e.status < 500) throw e;
      lastErr = e;
      if (attempt < retries) await sleepImpl(backoffDelay(attempt, baseMs));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
  }
}

export async function fetchJson<T>(url: string, opts?: RetryOptions): Promise<T> {
  return (await (await fetchWithRetry(url, opts)).json()) as T;
}

/** Run `fn` over items with at most `limit` in flight. Results keep input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

/** FNV-1a hash of a string mapped to [0, 1). Stable ordering key. */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}
