import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { getDb } from "@/db";
import { setLike } from "@/lib/services/walls";

type Ctx = { params: Promise<{ id: string }> };
const handler = (liked: boolean) => async (_req: Request, ctx: Ctx) =>
  api(async (uid) => {
    const artworkId = decodeURIComponent((await ctx.params).id);
    const r = await setLike(getDb(), uid, { artworkId }, liked);
    revalidatePath("/me");
    return r;
  });

export const PUT = handler(true);
export const DELETE = handler(false);
