import { api, publicCache } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { searchArtworks } from "@/lib/queries";
import { searchInput } from "@/lib/validation";

export async function GET(req: Request) {
  return api(async () => {
    const parsed = searchInput.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) throw new AppError("INVALID", parsed.error.issues[0]?.message ?? "Invalid query");
    return searchArtworks(parsed.data);
  }, { headers: publicCache });
}
