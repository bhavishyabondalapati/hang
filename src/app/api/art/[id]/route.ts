import { api, publicCache } from "@/lib/api";
import { idSchema } from "@/lib/artwork";
import { AppError } from "@/lib/errors";
import { getArtwork } from "@/lib/queries";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const id = idSchema.safeParse(decodeURIComponent((await ctx.params).id));
    if (!id.success) throw new AppError("INVALID", "Invalid artwork id");
    const art = await getArtwork(id.data);
    if (!art) throw new AppError("NOT_FOUND", "Artwork not found");
    return art;
  }, { headers: publicCache });
}
