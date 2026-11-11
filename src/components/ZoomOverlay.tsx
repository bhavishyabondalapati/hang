"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = { title: string; iiifBase: string | null; src: string; onClose: () => void };

export function ZoomOverlay({ title, iiifBase, src, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const api = useRef<{ zoomBy: (f: number) => void; reset: () => void } | null>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; prev?.focus?.(); };
  }, []);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key === "+" || e.key === "=") api.current?.zoomBy(1.4);
    else if (e.key === "-" || e.key === "_") api.current?.zoomBy(1 / 1.4);
    else if (e.key === "0") api.current?.reset();
    if (e.key === "Tab") {
      // keep focus inside the dialog
      const f = root.current?.querySelectorAll<HTMLElement>("button, [tabindex='0']");
      if (!f?.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  return (
    <motion.div ref={root} role="dialog" aria-modal="true" aria-label={`Zoom: ${title}`} className="fixed inset-0 z-50 bg-[#0d0c0a] text-[#efeadf]" onKeyDown={onKey}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
      {iiifBase ? <TiledViewer iiifBase={iiifBase} apiRef={api} /> : <PanZoomViewer src={src} title={title} apiRef={api} />}
      <div className="absolute right-3 top-3 flex gap-2 sm:right-5 sm:top-5">
        <button type="button" className="btn" style={{ background: "#efeadf", color: "#0d0c0a" }} aria-label="Zoom in" onClick={() => api.current?.zoomBy(1.5)}>+</button>
        <button type="button" className="btn" style={{ background: "#efeadf", color: "#0d0c0a" }} aria-label="Zoom out" onClick={() => api.current?.zoomBy(1 / 1.5)}>&minus;</button>
        <button ref={closeRef} type="button" className="btn" style={{ background: "#efeadf", color: "#0d0c0a" }} onClick={onClose}>Close</button>
      </div>
      <p className="pointer-events-none absolute bottom-3 left-4 right-4 text-[0.85rem] text-[#b9b3a4]">
        Drag to pan. Scroll, pinch or use + and &minus; to zoom. Esc closes.
      </p>
    </motion.div>
  );
}

type Api = React.MutableRefObject<{ zoomBy: (f: number) => void; reset: () => void } | null>;

/** True deep zoom: IIIF tiles via OpenSeadragon (Art Institute of Chicago serves a IIIF Image API). */
function TiledViewer({ iiifBase, apiRef }: { iiifBase: string; apiRef: Api }) {
  const el = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let viewer: import("openseadragon").Viewer | null = null;
    let dead = false;
    (async () => {
      try {
        const OSD = (await import("openseadragon")).default;
        if (dead || !el.current) return;
        viewer = OSD({
          element: el.current,
          tileSources: `${iiifBase}/info.json`,
          showNavigationControl: false,
          animationTime: 0.6,
          maxZoomPixelRatio: 2.5,
          visibilityRatio: 0.6,
          crossOriginPolicy: "Anonymous",
          gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
          immediateRender: true,
        });
        viewer.addHandler("open-failed", () => setFailed(true));
        apiRef.current = {
          zoomBy: (f) => { viewer?.viewport.zoomBy(f); viewer?.viewport.applyConstraints(); },
          reset: () => viewer?.viewport.goHome(),
        };
      } catch { setFailed(true); }
    })();
    return () => { dead = true; apiRef.current = null; viewer?.destroy(); };
  }, [iiifBase, apiRef]);

  if (failed) return <p className="p-8">The tiles could not be loaded. Close and try the museum page.</p>;
  return <div ref={el} className="h-full w-full" tabIndex={0} aria-label="Zoomable image" />;
}

/** Fallback for museums without tile servers: wheel / drag / pinch / keyboard on one large image. */
function PanZoomViewer({ src, title, apiRef }: { src: string; title: string; apiRef: Api }) {
  const box = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ x: 0, y: 0, k: 1 });
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; k: number } | null>(null);
  const [ready, setReady] = useState(false);
  // True while a finger or the mouse is down, so the image follows it without the easing transition.
  const [dragging, setDragging] = useState(false);

  const clampK = (k: number) => Math.min(8, Math.max(1, k));
  const zoomAt = useCallback((f: number, cx?: number, cy?: number) => {
    const r = box.current?.getBoundingClientRect();
    const px = cx !== undefined && r ? cx - r.left - r.width / 2 : 0;
    const py = cy !== undefined && r ? cy - r.top - r.height / 2 : 0;
    setT((s) => {
      const k = clampK(s.k * f);
      const ratio = k / s.k;
      return k === 1 ? { x: 0, y: 0, k } : { x: px - (px - s.x) * ratio, y: py - (py - s.y) * ratio, k };
    });
  }, []);

  useEffect(() => {
    apiRef.current = { zoomBy: (f) => zoomAt(f), reset: () => setT({ x: 0, y: 0, k: 1 }) };
    return () => { apiRef.current = null; };
  }, [apiRef, zoomAt]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0018), e.clientX, e.clientY); };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoomAt]);

  function down(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), k: t.k };
    }
  }
  function move(e: React.PointerEvent) {
    const prev = pts.current.get(e.pointerId);
    if (!prev) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2 && pinch.current) {
      const [a, b] = [...pts.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const target = clampK(pinch.current.k * (d / pinch.current.d));
      zoomAt(target / t.k, (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (pts.current.size === 1 && t.k > 1) {
      setT((s) => ({ ...s, x: s.x + e.clientX - prev.x, y: s.y + e.clientY - prev.y }));
    }
  }
  function up(e: React.PointerEvent) {
    pts.current.delete(e.pointerId);
    setDragging(pts.current.size > 0);
    if (pts.current.size < 2) pinch.current = null;
  }
  function key(e: React.KeyboardEvent) {
    const step = 60;
    if (e.key === "ArrowLeft") setT((s) => ({ ...s, x: s.x + step }));
    else if (e.key === "ArrowRight") setT((s) => ({ ...s, x: s.x - step }));
    else if (e.key === "ArrowUp") setT((s) => ({ ...s, y: s.y + step }));
    else if (e.key === "ArrowDown") setT((s) => ({ ...s, y: s.y - step }));
    else return;
    e.preventDefault();
  }

  return (
    <div
      ref={box} tabIndex={0} aria-label="Zoomable image. Use arrow keys to pan."
      className="flex h-full w-full touch-none select-none items-center justify-center overflow-hidden"
      style={{ cursor: t.k > 1 ? "grab" : "zoom-in" }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onDoubleClick={(e) => (t.k > 1 ? setT({ x: 0, y: 0, k: 1 }) : zoomAt(3, e.clientX, e.clientY))}
      onKeyDown={key}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- full-resolution original, intentionally not optimised */}
      <img
        src={src} alt={title} draggable={false} onLoad={() => setReady(true)}
        className="max-h-full max-w-full object-contain"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})`, transition: dragging ? "none" : "transform 0.18s ease-out", opacity: ready ? 1 : 0.4 }}
      />
    </div>
  );
}
