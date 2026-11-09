import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { testAuthEnabled } from "@/lib/test-auth";

/**
 * Test-only sign-in used by Playwright. It creates a user plus a real database session and sets the
 * Auth.js cookie, so the rest of the app exercises its normal code paths.
 * It 404s unless E2E_AUTH=1 AND NODE_ENV is not "production" (see src/lib/test-auth.ts).
 */
export async function POST(req: Request) {
  if (!testAuthEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }
  const { name = "E2E Curator", key = "e2e" } = (await req.json().catch(() => ({}))) as { name?: string; key?: string };
  const db = getDb();
  const email = `${String(key).replace(/[^a-z0-9]/gi, "").slice(0, 24)}@e2e.test`;
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) [user] = await db.insert(users).values({ name, email }).returning();
  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + 24 * 3600 * 1000);
  await db.insert(sessions).values({ sessionToken: token, userId: user!.id, expires });
  const res = NextResponse.json({ ok: true, userId: user!.id });
  res.cookies.set("authjs.session-token", token, { httpOnly: true, sameSite: "lax", path: "/", expires });
  return res;
}
