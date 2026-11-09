"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { addToWallAction, createWallAction, removeFromWallAction, setLikeAction } from "@/app/actions";

type State = { signedIn: boolean; liked: boolean; likes: number; walls: Array<{ id: string; title: string; slug: string; has: boolean }> };

export function ArtActions({ artworkId, museumUrl, museumName }: { artworkId: string; museumUrl: string; museumName: string }) {
  const [s, setS] = useState<State | null>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const menu = useRef<HTMLDivElement>(null);
  const next = `/signin?next=${encodeURIComponent(`/art/${artworkId}`)}`;

  useEffect(() => {
    let live = true;
    fetch(`/api/art/${encodeURIComponent(artworkId)}/state`).then((r) => r.json()).then((d) => live && setS(d)).catch(() => {});
    return () => { live = false; };
  }, [artworkId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); (menu.current?.querySelector("button") as HTMLElement | null)?.focus(); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function like() {
    if (!s?.signedIn) return;
    const want = !s.liked;
    setS({ ...s, liked: want, likes: s.likes + (want ? 1 : -1) });
    start(async () => {
      const r = await setLikeAction({ artworkId }, want);
      if (!r.ok) { setS((p) => p && { ...p, liked: !want, likes: p.likes + (want ? -1 : 1) }); setMsg(r.message); }
      else setMsg(want ? "Added to your likes." : "Removed from your likes.");
    });
  }

  function toggleWall(w: State["walls"][number]) {
    setS((p) => p && { ...p, walls: p.walls.map((x) => (x.id === w.id ? { ...x, has: !x.has } : x)) });
    start(async () => {
      const r = w.has
        ? await removeFromWallAction({ wallId: w.id, artworkId })
        : await addToWallAction({ wallId: w.id, artworkId });
      if (!r.ok) { setS((p) => p && { ...p, walls: p.walls.map((x) => (x.id === w.id ? { ...x, has: w.has } : x)) }); setMsg(r.message); }
      else setMsg(w.has ? `Removed from ${w.title}.` : `Added to ${w.title}.`);
    });
  }

  function createAndAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("title") as HTMLInputElement;
    const title = input.value.trim();
    if (!title) return;
    start(async () => {
      const c = await createWallAction({ title, isPublic: true });
      if (!c.ok) return setMsg(c.message);
      const a = await addToWallAction({ wallId: c.data.id, artworkId });
      if (!a.ok) return setMsg(a.message);
      setS((p) => p && { ...p, walls: [{ id: c.data.id, title, slug: c.data.slug, has: true }, ...p.walls] });
      setMsg(`Added to ${title}.`);
      input.value = "";
    });
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      {s && !s.signedIn ? (
        <>
          <Link href={next} className="btn btn-quiet">Like</Link>
          <Link href={next} className="btn">Add to wall</Link>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-quiet" aria-pressed={s?.liked ?? false} onClick={like} disabled={!s || pending}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.8 8.2 3 4.5 6.6 4.5c2 0 3.7 1.1 5.4 3.2 1.7-2.1 3.4-3.2 5.4-3.2 3.600 0 5.800 3.700 4.200 7.300C19.500 16.400 12 21 12 21z" fill={s?.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
            {s?.liked ? "Liked" : "Like"}
            {s && s.likes > 0 && <span className="tnum opacity-70">{s.likes}</span>}
          </button>
          <div ref={menu} className="relative">
            <button type="button" className="btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)} disabled={!s}>Add to wall</button>
            <AnimatePresence>
            {open && s && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
                className="absolute left-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] bg-paper p-3 text-ink shadow-[0_18px_40px_-12px_var(--shadow)]">
                {s.walls.length > 0 ? (
                  <ul className="max-h-60 overflow-auto" role="group" aria-label="Your walls">
                    {s.walls.map((w) => (
                      <li key={w.id}>
                        <button type="button" aria-pressed={w.has} onClick={() => toggleWall(w)} className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-2 text-left hover:bg-paper-2">
                          <span className="truncate">{w.title}</span>
                          <span className="meta">{w.has ? "On wall" : "Add"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="px-2 pb-2 text-[0.92rem] text-ink-2">You don&rsquo;t have a wall yet. Name your first one.</p>}
                <form onSubmit={createAndAdd} className="mt-2 flex gap-2">
                  <label className="sr-only" htmlFor="new-wall">New wall title</label>
                  <input id="new-wall" name="title" className="field !min-h-11" placeholder="New wall title" maxLength={80} />
                  <button className="btn !min-h-11" type="submit" disabled={pending}>Create</button>
                </form>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </>
      )}
      <a className="btn btn-quiet" href={museumUrl} target="_blank" rel="noopener noreferrer">
        View at {museumName}
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 9l6-6M4 3h5v5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </a>
      <p role="status" aria-live="polite" className="meta w-full">{msg}</p>
    </div>
  );
}
