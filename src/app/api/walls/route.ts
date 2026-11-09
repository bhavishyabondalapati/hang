import { revalidatePath } from "next/cache";
import { api, readJson } from "@/lib/api";
import { getDb } from "@/db";
import { createWall } from "@/lib/services/walls";

export async function POST(req: Request) {
  return api(async (uid) => {
    const wall = await createWall(getDb(), uid, await readJson(req));
    revalidatePath("/me");
    return wall;
  }, { status: 201 });
}
