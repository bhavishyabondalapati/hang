import Image from "next/image";
import type { ArtworkRow } from "@/db/schema";
import { altFor, blurFor, vtName, artHref } from "@/lib/blur";
import { TransitionLink } from "./TransitionLink";

export function Swatches({ palette, className = "" }: { palette: string[]; className?: string }) {
  return (
    <ul className={`flex gap-0 ${className}`} aria-label="Palette">
      {palette.map((hex) => (
        <li key={hex} className="flex-1 min-w-0">
          <span className="block h-9 sm:h-11" style={{ background: hex }} />
          <span className="meta tnum mt-1.5 block truncate">{hex.toUpperCase()}</span>
        </li>
      ))}
    </ul>
  );
}

export function TodayHero({ art, date }: { art: ArtworkRow; date: string }) {
  const pretty = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  return (
    <section aria-labelledby="today-h">
      <TransitionLink href={artHref(art.id)} name={vtName(art.id)} className="block" aria-label={`Open ${art.title}`}>
        <div className="relative h-[min(78svh,62vw)] min-h-[360px] w-full overflow-hidden bg-paper-3" data-vt style={{ background: art.dominantColor ?? undefined }}>
          <Image
            src={art.imageMedium}
            alt={altFor(art)}
            fill
            priority
            fetchPriority="high"
            sizes="100vw"
            quality={80}
            placeholder="blur"
            blurDataURL={blurFor(art.dominantColor)}
            className="kenburns object-cover"
          />
        </div>
      </TransitionLink>
      <div className="wrap grid gap-8 pt-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:items-end md:gap-16">
        <div>
          <h1 id="today-h" className="meta">Today&rsquo;s piece &middot; <time dateTime={date}>{pretty}</time></h1>
          <p className="display display-xl mt-2 max-w-[18ch] [text-wrap:balance]">
            <TransitionLink href={artHref(art.id)} name={vtName(art.id) + "-t"} className="no-underline hover:text-accent">{art.title}</TransitionLink>
          </p>
          <p className="lede mt-3">
            {[art.artist, art.date].filter(Boolean).join(", ")}
            <span className="meta ml-3">{art.museum}</span>
          </p>
        </div>
        <Swatches palette={art.palette} />
      </div>
    </section>
  );
}
