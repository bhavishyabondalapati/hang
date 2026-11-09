import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ArtBatch } from "@/components/ArtCardItem";
import { CreateWall } from "@/components/CreateWall";
import { blurFor } from "@/lib/blur";
import { listMyLikes, listMyWalls } from "@/lib/queries";

export const metadata: Metadata = { title: "Your walls", robots: { index: false } };

export default async function Me() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/me");
  const [walls, likes] = await Promise.all([listMyWalls(session.user.id), listMyLikes(session.user.id)]);

  return (
    <div className="wrap pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-6">
        <h1 className="display display-xl">Your walls</h1>
        <CreateWall />
      </div>

      <section className="mt-12" aria-labelledby="walls-h">
        <h2 id="walls-h" className="sr-only">Walls</h2>
        {walls.length === 0 ? (
          <div className="py-12">
            <p className="display display-l max-w-[20ch]">Nothing hung yet.</p>
            <p className="lede mt-3">Make a wall, then open any artwork and choose <em>Add to wall</em>.</p>
          </div>
        ) : (
          <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 xl:grid-cols-3">
            {walls.map((w) => (
              <li key={w.id}>
                <Link href={`/walls/${w.slug}`} className="block no-underline" aria-label={`${w.title}, ${w.count} works, ${w.isPublic ? "public" : "private"}`}>
                  <span className="grid aspect-[16/10] grid-cols-4 gap-0.5 bg-paper-3" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => {
                      const p = w.previews[i];
                      return (
                        <span key={i} className="relative block overflow-hidden" style={{ background: p?.color ?? "var(--paper-3)" }}>
                          {p && <Image src={p.imageSmall} alt="" fill sizes="12vw" className="object-cover" placeholder="blur" blurDataURL={blurFor(p.color)} />}
                        </span>
                      );
                    })}
                  </span>
                  <span className="display mt-3 block text-[1.5rem] leading-tight">{w.title}</span>
                  <span className="meta tnum">{w.count} {w.count === 1 ? "work" : "works"} &middot; {w.isPublic ? "Public" : "Private"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-20" aria-labelledby="likes-h">
        <h2 id="likes-h" className="display display-l mb-6">Liked</h2>
        {likes.length ? <ArtBatch items={likes} label="Liked artworks" /> : <p className="lede">Works you like will collect here.</p>}
      </section>
    </div>
  );
}
