import { revalidatePath } from "next/cache";
import { api, readJson } from "@/lib/api";
import { getDb } from "@/db";
import { addToWall, removeFromWall } from "@/lib/services/walls";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  return api(async (uid) => {
    const body = (await readJson(req)) as { artworkId?: string };
    const { wall, added } = await addToWall(getDb(), uid, { wallId: (await ctx.params).id, artworkId: body.artworkId });
    revalidatePath(`/walls/${wall.slug}`);
    return { added };
  }, { status: 201 });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return api(async (uid) => {
    const body = (await readJson(req)) as { artworkId?: string };
    const wall = await removeFromWall(getDb(), uid, { wallId: (await ctx.params).id, artworkId: body.artworkId });
    revalidatePath(`/walls/${wall.slug}`);
    return { ok: true };
  });
}
