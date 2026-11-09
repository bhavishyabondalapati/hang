import Image from "next/image";
import { blurFor, altFor, artHref, vtName } from "@/lib/blur";
import type { ArtCard } from "@/lib/queries";
import { TransitionLink } from "./TransitionLink";

/** Aspect ratio is known up front from the database, so the grid never shifts as images load. */
export function ArtCardItem({ art, index = 0, priority = false }: { art: ArtCard; index?: number; priority?: boolean }) {
  const w = art.width ?? 4;
  const h = art.height ?? 5;
  const ratio = Math.min(Math.max(w / h, 0.55), 2.2);
  return (
    <li className="reveal" style={{ "--i": index } as React.CSSProperties}>
      <TransitionLink href={artHref(art.id)} name={vtName(art.id)} className="card" aria-label={altFor(art)}>
        <span className="card-img" data-vt style={{ aspectRatio: String(ratio), "--c": art.dominantColor ?? undefined } as React.CSSProperties}>
          <Image
            src={art.imageSmall}
            alt=""
            fill
            sizes="(min-width:2300px) 16vw, (min-width:1700px) 20vw, (min-width:1100px) 25vw, (min-width:720px) 33vw, 50vw"
            placeholder="blur"
            blurDataURL={blurFor(art.dominantColor)}
            priority={priority}
            loading={priority ? "eager" : "lazy"}
          />
        </span>
        <span className="card-cap">
          <span className="card-title">{art.title}</span>
          <span className="meta">{[art.artist, art.date].filter(Boolean).join(", ")}</span>
        </span>
      </TransitionLink>
    </li>
  );
}

export function ArtBatch({ items, offset = 0, label }: { items: ArtCard[]; offset?: number; label?: string }) {
  return (
    <ul className="masonry" aria-label={label}>
      {items.map((a, i) => (
        <ArtCardItem key={a.id} art={a} index={i} priority={offset === 0 && i < 4} />
      ))}
    </ul>
  );
}

/** Horizontal, scroll-snapping rail (used for "More in this color"). Heights are fixed so widths follow aspect ratio. */
export function ArtRail({ items, label }: { items: ArtCard[]; label: string }) {
  return (
    <ul className="-mx-[var(--gutter)] flex snap-x gap-4 overflow-x-auto px-[var(--gutter)] pb-4 [scrollbar-width:thin]" aria-label={label} tabIndex={0}>
      {items.map((art, i) => {
        const ratio = Math.min(Math.max((art.width ?? 4) / (art.height ?? 5), 0.55), 2.2);
        return (
          <li key={art.id} className="shrink-0 snap-start" style={{ width: `calc(clamp(170px, 20vw, 260px) * ${ratio.toFixed(3)})` }}>
            <TransitionLink href={artHref(art.id)} name={vtName(art.id)} className="card" aria-label={altFor(art)}>
              <span className="card-img" data-vt style={{ height: "clamp(170px, 20vw, 260px)", "--c": art.dominantColor ?? undefined } as React.CSSProperties}>
                <Image src={art.imageSmall} alt="" fill sizes="260px" placeholder="blur" blurDataURL={blurFor(art.dominantColor)} loading={i < 3 ? "eager" : "lazy"} />
              </span>
              <span className="card-cap"><span className="card-title">{art.title}</span><span className="meta">{[art.artist, art.date].filter(Boolean).join(", ")}</span></span>
            </TransitionLink>
          </li>
        );
      })}
    </ul>
  );
}
