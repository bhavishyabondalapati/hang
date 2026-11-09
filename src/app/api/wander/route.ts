import { z } from "zod";
import { api, publicCache } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { wander } from "@/lib/queries";

const q = z.object({ cursor: z.string().max(80).regex(/^[0-9.eE+-]+\|[a-z]+:[A-Za-z0-9._-]+$/).optional() });

export async function GET(req: Request) {
  return api(async () => {
    const p = q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!p.success) throw new AppError("INVALID", "Bad cursor");
    return wander(p.data.cursor ?? null);
  }, { headers: publicCache });
}
