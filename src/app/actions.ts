"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { toResult, type ActionResult } from "@/lib/errors";
import { addToWall, createWall, deleteWall, removeFromWall, reorderWall, setLike, updateWall } from "@/lib/services/walls";

async function run<T>(fn: (userId: string | undefined) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const session = await auth();
    return { ok: true, data: await fn(session?.user?.id) };
  } catch (e) {
    return toResult(e);
  }
}

export async function createWallAction(raw: unknown) {
  return run(async (uid) => {
    const w = await createWall(getDb(), uid, raw);
    revalidatePath("/me");
    return { id: w.id, slug: w.slug };
  });
}

export async function updateWallAction(raw: unknown) {
  return run(async (uid) => {
    const w = await updateWall(getDb(), uid, raw);
    revalidatePath("/me");
    revalidatePath(`/walls/${w.slug}`);
    return { id: w.id, slug: w.slug, theme: w.theme, isPublic: w.isPublic };
  });
}

export async function deleteWallAction(raw: unknown) {
  return run(async (uid) => {
    const w = await deleteWall(getDb(), uid, raw);
    revalidatePath("/me");
    revalidatePath(`/walls/${w.slug}`);
    return { id: w.id };
  });
}

export async function addToWallAction(raw: unknown) {
  return run(async (uid) => {
    const { wall, added } = await addToWall(getDb(), uid, raw);
    revalidatePath("/me");
    revalidatePath(`/walls/${wall.slug}`);
    return { wallId: wall.id, slug: wall.slug, added };
  });
}

export async function removeFromWallAction(raw: unknown) {
  return run(async (uid) => {
    const w = await removeFromWall(getDb(), uid, raw);
    revalidatePath("/me");
    revalidatePath(`/walls/${w.slug}`);
    return { wallId: w.id };
  });
}

export async function reorderWallAction(raw: unknown) {
  return run(async (uid) => {
    const w = await reorderWall(getDb(), uid, raw);
    revalidatePath(`/walls/${w.slug}`);
    return { wallId: w.id };
  });
}

export async function setLikeAction(raw: unknown, liked: boolean) {
  return run(async (uid) => {
    const r = await setLike(getDb(), uid, raw, liked);
    revalidatePath("/me");
    return r;
  });
}
