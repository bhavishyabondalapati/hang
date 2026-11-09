import { revalidatePath } from "next/cache";
import { api, readJson } from "@/lib/api";
import { getDb } from "@/db";
import { deleteWall, updateWall } from "@/lib/services/walls";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  return api(async (uid) => {
    const body = (await readJson(req)) as object;
    const wall = await updateWall(getDb(), uid, { ...body, wallId: (await ctx.params).id });
    revalidatePath("/me");
    revalidatePath(`/walls/${wall.slug}`);
    return wall;
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return api(async (uid) => {
    const wall = await deleteWall(getDb(), uid, { wallId: (await ctx.params).id });
    revalidatePath("/me");
    return { id: wall.id };
  });
}
