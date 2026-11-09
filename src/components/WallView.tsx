"use client";

import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteWallAction, removeFromWallAction, reorderWallAction, updateWallAction } from "@/app/actions";
import { THEMES, type Theme } from "@/lib/artwork";
import { altFor, artHref, blurFor } from "@/lib/blur";
import type { ArtCard } from "@/lib/queries";

type Item = ArtCard;
type WallProps = {
  wallId: string; slug: string; title: string; description: string; theme: Theme; isPublic: boolean;
  owner: string; items: Item[]; isOwner: boolean; shareUrl: string;
};

const THEME_LABEL: Record<Theme, string> = { plaster: "Plaster", "gallery-white": "Gallery white", night: "Night" };
const ROW_H = "clamp(150px, 24vh, 300px)";

export function WallView(p: WallProps) {
  const [items, setItems] = useState(p.items);
  const [theme, setTheme] = useState<Theme>(p.theme);
  const [isPublic, setIsPublic] = useState(p.isPublic);
  const [status, setStatus] = useState("");
  const [, start] = useTransition();
  const lastGood = useRef(p.items);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function persist(next: Item[]) {
    const before = lastGood.current;
    setItems(next);
    start(async () => {
      const r = await reorderWallAction({ wallId: p.wallId, orderedArtworkIds: next.map((i) => i.id) });
      if (r.ok) { lastGood.current = next; }
      else { setItems(before); setStatus(`Could not save the new order: ${r.message}`); }
    });
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    const it = items.find((i) => i.id === e.active.id);
    setStatus(it ? `Picked up ${it.title}.` : "");
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return setStatus("Dropped in place.");
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    persist(arrayMove(items, from, to));
    setStatus(`Moved ${items[from]?.title} to position ${to + 1} of ${items.length}.`);
  }

  function nudge(id: string, dir: -1 | 1) {
    const from = items.findIndex((i) => i.id === id);
    const to = from + dir;
    if (to < 0 || to >= items.length) return;
    persist(arrayMove(items, from, to));
    setStatus(`Moved ${items[from]?.title} to position ${to + 1} of ${items.length}.`);
  }

  function remove(id: string) {
    const it = items.find((i) => i.id === id);
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    start(async () => {
      const r = await removeFromWallAction({ wallId: p.wallId, artworkId: id });
      if (r.ok) { lastGood.current = next; setStatus(`Removed ${it?.title}.`); }
      else { setItems(items); setStatus(r.message); }
    });
  }

  function changeTheme(t: Theme) {
    const prev = theme;
    setTheme(t);
    start(async () => {
      const r = await updateWallAction({ wallId: p.wallId, theme: t });
      if (!r.ok) { setTheme(prev); setStatus(r.message); } else setStatus(`Theme set to ${THEME_LABEL[t]}.`);
    });
  }

  function changeVisibility(v: boolean) {
    setIsPublic(v);
    start(async () => {
      const r = await updateWallAction({ wallId: p.wallId, isPublic: v });
      if (!r.ok) { setIsPublic(!v); setStatus(r.message); } else setStatus(v ? "This wall is now public." : "This wall is now private.");
    });
  }

  async function copy() {
    try { await navigator.clipboard.writeText(p.shareUrl); setStatus("Link copied."); } catch { setStatus(p.shareUrl); }
  }

  return (
    <div className="wall min-h-[calc(100svh-4.5rem)] transition-colors duration-500" data-theme={theme}>
      <div className="wrap pb-24 pt-10">
        {/* placard */}
        <div className="placard">
          <div className="flex items-start justify-between gap-4">
            <h1 className="display text-[clamp(1.6rem,1.2rem+1vw,2.2rem)] leading-[1.1]">{p.title}</h1>
            <span className="seal" aria-hidden="true" data-testid="seal" />
          </div>
          <p className="mt-1 text-[0.95rem]" style={{ color: "#4a443a" }}>
            Hung by {p.owner} <span className="tnum">&middot; {items.length} {items.length === 1 ? "work" : "works"}</span>
          </p>
          {p.description && <p className="mt-3 max-w-[44ch] text-[0.95rem]">{p.description}</p>}
        </div>

        {p.isOwner && (
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div role="radiogroup" aria-label="Wall finish" className="flex flex-wrap gap-1.5">
              {THEMES.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={theme === t} className="btn btn-quiet !min-h-10" onClick={() => changeTheme(t)}>{THEME_LABEL[t]}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-quiet !min-h-10" aria-pressed={isPublic} onClick={() => changeVisibility(!isPublic)}>{isPublic ? "Public" : "Private"}</button>
              {isPublic && <button type="button" className="btn btn-quiet !min-h-10" onClick={copy}>Copy link</button>}
            </div>
            <DeleteWall wallId={p.wallId} onError={setStatus} />
          </div>
        )}

        <p role="status" aria-live="polite" className="mt-3 min-h-6 text-[0.9rem]" style={{ color: "var(--wall-ink-2)" }}>{status}</p>

        {items.length === 0 ? (
          <div className="py-24">
            <p className="display display-l max-w-[18ch]">An empty wall, waiting.</p>
            <p className="mt-3 max-w-[44ch]" style={{ color: "var(--wall-ink-2)" }}>
              {p.isOwner ? <>Open any artwork and choose <strong>Add to wall</strong>. <Link className="link" href="/">Start wandering</Link>.</> : "Nothing has been hung here yet."}
            </p>
          </div>
        ) : p.isOwner ? (
          <>
            <p className="mt-6 max-w-[60ch] text-[0.9rem]" style={{ color: "var(--wall-ink-2)" }}>Drag a frame to rearrange, or focus one and press Space, then the arrow keys. Each frame also has Earlier and Later buttons.</p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
              <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
                <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-[clamp(24px,4.5vw,72px)] gap-y-[clamp(36px,6vw,80px)]" aria-label="Artworks on this wall, in order">
                  {items.map((it, i) => (
                    <SortableFrame key={it.id} item={it} index={i} count={items.length} dragging={activeId === it.id} onNudge={nudge} onRemove={remove} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </>
        ) : (
          <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-[clamp(24px,4.5vw,72px)] gap-y-[clamp(36px,6vw,80px)]" aria-label="Artworks on this wall">
            {items.map((it, i) => (
              <li key={it.id} className="reveal" style={{ "--i": i } as React.CSSProperties}>
                <Framed item={it} link priority={i < 3} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Framed({ item, link, priority }: { item: Item; link?: boolean; priority?: boolean }) {
  const ratio = Math.min(Math.max((item.width ?? 4) / (item.height ?? 5), 0.5), 2.4);
  const inner = (
    <>
      <span className="frame block" style={{ height: `min(${ROW_H}, calc(min(46vw, 440px) / ${ratio.toFixed(3)}))`, aspectRatio: String(ratio) }}>
        <span className="frame-mat block h-full w-full">
          <span className="frame-img h-full" style={{ "--c": item.dominantColor ?? undefined } as React.CSSProperties}>
            <Image
              src={item.imageSmall} alt={altFor(item)} fill sizes="(min-width:1024px) 40vw, 90vw" priority={priority}
              className="object-cover" placeholder="blur" blurDataURL={blurFor(item.dominantColor)}
            />
          </span>
        </span>
      </span>
      <span className="mt-3 block max-w-[min(24rem,80vw)] text-[0.85rem] leading-snug" style={{ color: "var(--wall-ink-2)" }}>
        <span className="display block text-[0.98rem]" style={{ color: "var(--wall-ink)" }}>{item.title}</span>
        {[item.artist, item.date].filter(Boolean).join(", ")}
      </span>
    </>
  );
  return link ? <Link href={artHref(item.id)} className="block no-underline" style={{ color: "inherit" }}>{inner}</Link> : <div>{inner}</div>;
}

function SortableFrame({ item, index, count, dragging, onNudge, onRemove }: {
  item: Item; index: number; count: number; dragging: boolean; onNudge: (id: string, d: -1 | 1) => void; onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      className="group relative touch-manipulation"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? "transform 250ms cubic-bezier(.2,.7,.2,1)",
        zIndex: dragging ? 5 : undefined,
        opacity: dragging ? 0.92 : 1,
      }}
    >
      {/* the frame itself is the drag handle; dnd-kit supplies keyboard behaviour and aria */}
      <div {...attributes} {...listeners} aria-label={`${item.title}. Position ${index + 1} of ${count}. Press space to pick up, arrow keys to move.`} className="cursor-grab active:cursor-grabbing">
        <Framed item={item} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <button type="button" className="btn btn-quiet !min-h-9 !px-3 text-[0.8rem]" disabled={index === 0} onClick={() => onNudge(item.id, -1)} aria-label={`Move ${item.title} earlier`}>Earlier</button>
        <button type="button" className="btn btn-quiet !min-h-9 !px-3 text-[0.8rem]" disabled={index === count - 1} onClick={() => onNudge(item.id, 1)} aria-label={`Move ${item.title} later`}>Later</button>
        <button type="button" className="btn btn-quiet !min-h-9 !px-3 text-[0.8rem]" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.title} from this wall`}>Remove</button>
      </div>
    </li>
  );
}

function DeleteWall({ wallId, onError }: { wallId: string; onError: (m: string) => void }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (!confirm) return <button type="button" className="btn btn-text !text-[var(--wall-ink)]" onClick={() => setConfirm(true)}>Delete wall</button>;
  return (
    <span className="flex items-center gap-2" role="group" aria-label="Confirm delete">
      <span className="text-[0.9rem]">Delete this wall for good?</span>
      <button type="button" className="btn !min-h-9" disabled={pending} onClick={() => start(async () => {
        const r = await deleteWallAction({ wallId });
        if (r.ok) router.push("/me"); else onError(r.message);
      })}>Yes, delete</button>
      <button type="button" className="btn btn-quiet !min-h-9" onClick={() => setConfirm(false)}>Keep</button>
    </span>
  );
}
