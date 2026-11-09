import { InfiniteBatches } from "@/components/InfiniteBatches";
import { TodayHero } from "@/components/TodayHero";
import { dailyArtwork, todayUtc, wander } from "@/lib/queries";

// The hero changes daily; an hourly revalidate keeps the page static and fast.
export const revalidate = 3600;

export default async function Home() {
  const date = todayUtc();
  const [hero, feed] = await Promise.all([dailyArtwork(date), wander(null)]);

  if (!hero) {
    return (
      <div className="wrap py-24">
        <h1 className="display display-xl max-w-[16ch]">The walls are still bare.</h1>
        <p className="lede mt-4">No Chinese artworks are in the database yet. Run <code>npm run ingest</code> to hang the first batch.</p>
      </div>
    );
  }
  return (
    <>
      <TodayHero art={hero} date={date} />
      <section className="wrap mt-24" aria-labelledby="wander-h">
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <h2 id="wander-h" className="display display-l">Wander</h2>
          <p className="lede !text-[1rem]">Over three thousand years of Chinese art, in no order. Follow whatever catches your eye.</p>
        </div>
        <InfiniteBatches initial={feed.items} initialCursor={feed.nextCursor} />
      </section>
    </>
  );
}
