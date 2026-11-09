import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArtActions } from "@/components/ArtActions";
import { ArtRail } from "@/components/ArtCardItem";
import { ArtViewer } from "@/components/ArtViewer";
import { BottomSheet } from "@/components/BottomSheet";
import { Swatches } from "@/components/TodayHero";
import { MUSEUMS, centuryLabel, idSchema } from "@/lib/artwork";
import { altFor } from "@/lib/blur";
import { getArtwork, moreInColor } from "@/lib/queries";

export const revalidate = 3600;
export const dynamicParams = true;

// No pre-rendered paths: each artwork page is generated on first request, then cached and revalidated hourly.
export function generateStaticParams() {
  return [];
}

async function load(raw: string) {
  const parsed = idSchema.safeParse(decodeURIComponent(raw));
  if (!parsed.success) return null;
  return getArtwork(parsed.data);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const a = await load((await params).id);
  if (!a) return { title: "Not found" };
  const desc = [a.artist, a.date, a.medium, a.museum].filter(Boolean).join(" · ");
  return {
    title: a.title,
    description: desc,
    alternates: { canonical: `/art/${a.id}` },
    openGraph: { title: a.title, description: desc, type: "article", images: [{ url: a.imageMedium, alt: altFor(a) }] },
    twitter: { card: "summary_large_image", title: a.title, description: desc, images: [a.imageMedium] },
  };
}

export default async function ArtPage({ params }: { params: Promise<{ id: string }> }) {
  const a = await load((await params).id);
  if (!a) notFound();
  const similar = await moreInColor(a.id);
  const museum = MUSEUMS[a.source];
  const rows: Array<[string, string | null]> = [
    ["Date", a.date],
    ["Medium", a.medium],
    ["Dimensions", a.dimensions],
    ["Culture", a.culture],
    ["Period", a.century ? centuryLabel(a.century) : null],
    ["Museum", a.museum],
    ["Credit", a.creditLine],
  ];

  return (
    <div className="art-stage" style={{ "--tint": a.palette[1] ?? a.dominantColor ?? "transparent" } as React.CSSProperties}>
      <div className="flex flex-col lg:min-h-[calc(100svh-4.5rem)] lg:flex-row lg:pr-[var(--gutter)]">
        <div className="flex-1 lg:flex lg:items-center">
          <ArtViewer
            id={a.id} title={a.title} alt={altFor(a)} src={a.imageMedium} zoomSrc={a.imageLarge} iiifBase={a.iiifBase}
            color={a.dominantColor} width={a.width} height={a.height}
          />
        </div>
        <BottomSheet peek={<><span className="display block truncate text-[1.2rem]">{a.title}</span><span className="meta block truncate">{a.artist ?? "Artist unknown"}</span></>}>
          <article className="pt-4 lg:sticky lg:top-6 lg:py-10">
            <p className="meta">{museum.short}</p>
            <h1 className="display mt-1 text-[clamp(1.9rem,1.4rem+1.2vw,2.7rem)] [text-wrap:balance]">{a.title}</h1>
            <p className="mt-2 text-[1.15rem] text-ink-2">{a.artist ?? "Artist unknown"}</p>
            <div className="mt-6"><ArtActions artworkId={a.id} museumUrl={a.sourceUrl} museumName={museum.short} /></div>
            <dl className="mt-8 grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-3 text-[0.95rem]">
              {rows.filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="meta pt-0.5">{k}</dt>
                  <dd className="min-w-0 [overflow-wrap:anywhere]">{v}</dd>
                </div>
              ))}
            </dl>
            <h2 className="meta mt-8 mb-2">Palette</h2>
            <Swatches palette={a.palette} />
            <p className="meta mt-6">Public domain (CC0). Found in the {museum.name} open collection.</p>
          </article>
        </BottomSheet>
      </div>

      {similar.length > 0 && (
        <section className="wrap pb-24 pt-14 max-lg:pb-40" aria-labelledby="color-h">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-5 w-5 shrink-0" style={{ background: a.palette[0] ?? a.dominantColor ?? "#888" }} aria-hidden="true" />
            <h2 id="color-h" className="display display-m">More in this color</h2>
            <Link href={a.hue != null && (a.saturation ?? 0) >= 0.15 ? `/search?hue=${Math.round(Math.floor(a.hue / 30) * 30) % 360}` : "/search"} className="link ml-auto text-[0.92rem]">See all</Link>
          </div>
          <ArtRail items={similar} label="Similar in colour" />
        </section>
      )}
    </div>
  );
}
