import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { idSchema } from "@/lib/artwork";
import { getViewerState, likeCount } from "@/lib/queries";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const parsed = idSchema.safeParse(decodeURIComponent((await ctx.params).id));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const session = await auth();
  const likes = await likeCount(parsed.data);
  const headers = { "Cache-Control": "private, no-store" };
  if (!session?.user?.id) return NextResponse.json({ signedIn: false, liked: false, likes, walls: [] }, { headers });
  const st = await getViewerState(session.user.id, parsed.data);
  return NextResponse.json({ signedIn: true, likes, ...st }, { headers });
}
