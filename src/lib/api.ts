import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AppError } from "./errors";

/** Wrap a route handler body: resolves the session, maps AppError to an HTTP status. */
export async function api<T>(fn: (userId: string | undefined) => Promise<T>, init?: { status?: number; headers?: HeadersInit }) {
  try {
    const session = await auth();
    return NextResponse.json(await fn(session?.user?.id), { status: init?.status ?? 200, headers: init?.headers });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.code, message: e.message, fields: e.fields }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "INTERNAL", message: "Unexpected error" }, { status: 500 });
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("INVALID", "Body must be JSON.");
  }
}

export const publicCache = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" };
