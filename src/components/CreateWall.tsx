"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createWallAction } from "@/app/actions";
import { THEMES, type Theme } from "@/lib/artwork";

const LABEL: Record<Theme, string> = { plaster: "Plaster", "gallery-white": "Gallery white", night: "Night" };

export function CreateWall() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("plaster");
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<{ message: string; fields?: Record<string, string[] | undefined> } | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await createWallAction({ title: fd.get("title"), description: fd.get("description") ?? "", isPublic, theme });
      if (r.ok) router.push(`/walls/${r.data.slug}`);
      else setError({ message: r.message, fields: r.fields });
    });
  }

  if (!open) return <button type="button" className="btn" onClick={() => setOpen(true)} data-testid="new-wall">New wall</button>;

  return (
    <form onSubmit={submit} className="grid max-w-2xl gap-5 bg-paper-2 p-5 sm:p-7" aria-label="Create a wall">
      <div>
        <label htmlFor="w-title" className="meta">Title</label>
        <input id="w-title" name="title" required maxLength={80} className="field mt-1" placeholder="Blue hour, mostly" autoFocus aria-invalid={!!error?.fields?.title} aria-describedby={error ? "w-err" : undefined} />
      </div>
      <div>
        <label htmlFor="w-desc" className="meta">Description (optional)</label>
        <textarea id="w-desc" name="description" maxLength={500} rows={3} className="field mt-1" />
      </div>
      <fieldset>
        <legend className="meta mb-1">Finish</legend>
        <div className="flex flex-wrap gap-1.5">
          {THEMES.map((t) => <button key={t} type="button" className="chip" aria-pressed={theme === t} onClick={() => setTheme(t)}>{LABEL[t]}</button>)}
        </div>
      </fieldset>
      <label className="flex items-center gap-3 text-[0.95rem]">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
        Anyone with the link can view this wall
      </label>
      {error && <p id="w-err" role="alert" className="text-[0.95rem]">{error.message}</p>}
      <div className="flex gap-3">
        <button type="submit" className="btn" disabled={pending}>{pending ? "Hanging…" : "Create wall"}</button>
        <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
