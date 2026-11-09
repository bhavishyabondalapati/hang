"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import { blurFor, vtName } from "@/lib/blur";

const ZoomOverlay = dynamic(() => import("./ZoomOverlay").then((m) => m.ZoomOverlay), { ssr: false });

export function ArtViewer(props: { id: string; title: string; alt: string; src: string; zoomSrc: string; iiifBase: string | null; color: string | null; width: number | null; height: number | null }) {
  const [zoom, setZoom] = useState(false);
  const ratio = props.width && props.height ? props.width / props.height : 1;
  return (
    <div className="relative flex h-full min-h-[300px] items-center justify-center px-[var(--gutter)] py-6">
      <button
        type="button" onClick={() => setZoom(true)} aria-label={`Zoom into ${props.title}`}
        className="relative block max-h-full max-w-full cursor-zoom-in border-0 bg-transparent p-0"
        style={{ aspectRatio: String(ratio), height: "min(100%, 82svh)", maxWidth: "100%", background: props.color ?? undefined }}
        data-vt
        ref={(el) => { if (el) el.style.viewTransitionName = vtName(props.id); }}
      >
        <Image
          src={props.src} alt={props.alt} fill priority fetchPriority="high" quality={85}
          sizes="(min-width:1024px) 70vw, 100vw" className="object-contain"
          placeholder="blur" blurDataURL={blurFor(props.color)}
        />
        <span className="btn btn-quiet absolute bottom-3 right-3 !min-h-9 !px-3 text-[0.85rem]" aria-hidden="true">Zoom</span>
      </button>
      {zoom && <ZoomOverlay title={props.title} iiifBase={props.iiifBase} src={props.zoomSrc} onClose={() => setZoom(false)} />}
    </div>
  );
}
