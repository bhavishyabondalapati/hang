"use client";

import { useEffect, useId, useState } from "react";

/**
 * Below the lg breakpoint the metadata panel becomes a bottom sheet: a peek strip with the title,
 * expandable to most of the screen. From lg up it is a plain side column.
 */
export function BottomSheet({ peek, children }: { peek: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open]);

  return (
    <aside
      aria-label="About this work"
      className={`art-panel fixed inset-x-0 bottom-0 z-20 flex flex-col bg-[var(--bg-2)] text-ink transition-[height] duration-300 ease-out lg:static lg:z-auto lg:h-auto lg:w-[26rem] lg:shrink-0 lg:bg-transparent ${open ? "h-[78svh]" : "h-[5.25rem]"}`}
      style={{ boxShadow: open ? "0 -20px 40px -16px var(--shadow)" : undefined }}
    >
      <button
        type="button" className="flex min-h-[5.25rem] w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-[var(--gutter)] text-left text-ink lg:hidden"
        aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
      >
        <span className="min-w-0">{peek}</span>
        <span className="meta shrink-0">{open ? "Close" : "Details"}</span>
      </button>
      <div id={id} className={`min-h-0 flex-1 overflow-y-auto px-[var(--gutter)] pb-10 lg:block lg:h-auto lg:overflow-visible lg:px-0 lg:pb-0 ${open ? "block" : "hidden"}`}>
        {children}
      </div>
    </aside>
  );
}
