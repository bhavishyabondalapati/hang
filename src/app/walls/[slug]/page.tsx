import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { WallView } from "@/components/WallView";
import { getWallBySlug } from "@/lib/queries";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const session = await auth();
  const data = await getWallBySlug(slug, session?.user?.id);
  if (!data) return { title: "Wall not found", robots: { index: false } };
  const desc = data.wall.description || `${data.items.length} works hung by ${data.owner.name ?? "a curator"} on Hang.`;
  return {
    title: data.wall.title,
    description: desc,
    robots: data.wall.isPublic ? undefined : { index: false },
    alternates: { canonical: `/walls/${slug}` },
    openGraph: { title: data.wall.title, description: desc, type: "article" },
    twitter: { card: "summary_large_image", title: data.wall.title, description: desc },
  };
}

export default async function WallPage({ params }: Params) {
  const { slug } = await params;
  const session = await auth();
  const data = await getWallBySlug(slug, session?.user?.id);
  if (!data) notFound();
  const { wall, owner, items, isOwner } = data;
  return (
    <WallView
      wallId={wall.id} slug={wall.slug} title={wall.title} description={wall.description} theme={wall.theme}
      isPublic={wall.isPublic} owner={owner.name ?? "a curator"} isOwner={isOwner} shareUrl={`${site}/walls/${wall.slug}`}
      items={items.map(({ position: _p, imageLarge: _l, ...c }) => c)}
    />
  );
}
