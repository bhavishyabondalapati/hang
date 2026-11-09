import { describe, expect, it } from "vitest";
import { testAuthEnabled } from "@/lib/test-auth";
import { POST } from "@/app/api/test/sign-in/route";

describe("testAuthEnabled", () => {
  it("is on only with E2E_AUTH=1 and a non-production NODE_ENV", () => {
    expect(testAuthEnabled({ E2E_AUTH: "1", NODE_ENV: "development" })).toBe(true);
    expect(testAuthEnabled({ E2E_AUTH: "1", NODE_ENV: "test" })).toBe(true);
    expect(testAuthEnabled({ E2E_AUTH: "1", NODE_ENV: "production" })).toBe(false);
    expect(testAuthEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(testAuthEnabled({ E2E_AUTH: "0", NODE_ENV: "development" })).toBe(false);
    expect(testAuthEnabled({ E2E_AUTH: "true", NODE_ENV: "development" })).toBe(false);
  });
});

describe("POST /api/test/sign-in guard", () => {
  const req = () => new Request("http://x/api/test/sign-in", { method: "POST", body: "{}" });
  const set = (k: string, v: string | undefined) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
  const run = async (e2e: string | undefined, nodeEnv: string) => {
    const old = { e: process.env.E2E_AUTH, n: process.env.NODE_ENV };
    set("E2E_AUTH", e2e);
    set("NODE_ENV", nodeEnv);
    try {
      return (await POST(req())).status;
    } finally {
      set("E2E_AUTH", old.e);
      set("NODE_ENV", old.n);
    }
  };
  it("404s without E2E_AUTH", async () => expect(await run(undefined, "development")).toBe(404));
  it("404s in production even with E2E_AUTH=1", async () => expect(await run("1", "production")).toBe(404));
});
