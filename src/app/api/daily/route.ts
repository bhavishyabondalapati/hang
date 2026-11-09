import { api, publicCache } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { dailyArtwork, todayUtc } from "@/lib/queries";
import { dateInput } from "@/lib/validation";

export async function GET(req: Request) {
  return api(async () => {
    const raw = new URL(req.url).searchParams.get("date") ?? todayUtc();
    const date = dateInput.safeParse(raw);
    if (!date.success) throw new AppError("INVALID", "date must be YYYY-MM-DD");
    const art = await dailyArtwork(date.data);
    if (!art) throw new AppError("NOT_FOUND", "No artwork available yet. Run npm run ingest.");
    return { date: date.data, artwork: art };
  }, { headers: publicCache });
}
