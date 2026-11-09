import { revalidatePath } from "next/cache";
import { api, readJson } from "@/lib/api";
import { getDb } from "@/db";
import { reorderWall } from "@/lib/services/walls";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return api(async (uid) => {
    const body = (await readJson(req)) as { orderedArtworkIds?: string[] };
    const wall = await reorderWall(getDb(), uid, { wallId: (await ctx.params).id, orderedArtworkIds: body.orderedArtworkIds });
    revalidatePath(`/walls/${wall.slug}`);
    return { ok: true };
  });
}
