/** The test-only sign-in route is on only when E2E_AUTH=1 AND NODE_ENV is not "production". */
export function testAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.E2E_AUTH === "1" && env.NODE_ENV !== "production";
}
