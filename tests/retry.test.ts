import { describe, expect, it, vi } from "vitest";
import { backoffDelay, fetchWithRetry, hash01, HttpError, mapLimit, parseRetryAfter } from "@/lib/retry";

const res = (status: number, headers: Record<string, string> = {}) => new Response("{}", { status, headers });

describe("retry", () => {
  it("backs off exponentially with a cap", () => {
    expect(backoffDelay(0, 500, 30_000, () => 0.5)).toBe(250);
    expect(backoffDelay(3, 500, 30_000, () => 0.999)).toBeLessThan(4000);
    expect(backoffDelay(20, 500, 30_000, () => 0.999)).toBeLessThanOrEqual(30_000);
  });
  it("parses Retry-After seconds and dates", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4000)).toBe(6000);
  });
  it("retries 429 and 5xx then succeeds", async () => {
    const f = vi.fn().mockResolvedValueOnce(res(429, { "retry-after": "1" })).mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200));
    const sleeps: number[] = [];
    const r = await fetchWithRetry("http://x", { fetchImpl: f, sleepImpl: async (ms) => void sleeps.push(ms) });
    expect(r.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleeps[0]).toBe(1000);
  });
  it("fails fast on 404", async () => {
    const f = vi.fn().mockResolvedValue(res(404));
    await expect(fetchWithRetry("http://x", { fetchImpl: f, sleepImpl: async () => {} })).rejects.toBeInstanceOf(HttpError);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("gives up after the retry budget", async () => {
    const f = vi.fn().mockResolvedValue(res(500));
    await expect(fetchWithRetry("http://x", { retries: 2, fetchImpl: f, sleepImpl: async () => {} })).rejects.toThrow(/500/);
    expect(f).toHaveBeenCalledTimes(3);
  });
  it("mapLimit respects the concurrency limit and order", async () => {
    let live = 0, peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      live++; peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--; return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBe(2);
  });
  it("hash01 is deterministic and in range", () => {
    expect(hash01("aic:1")).toBe(hash01("aic:1"));
    expect(hash01("aic:1")).not.toBe(hash01("aic:2"));
    const v = hash01("met:99");
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});
