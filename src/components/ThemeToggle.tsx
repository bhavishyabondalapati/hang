"use client";

import { useEffect, useState } from "react";

type Mode = "light" | "dark";

function current(): Mode {
  const attr = document.documentElement.dataset.theme as Mode | undefined;
  if (attr === "light" || attr === "dark") return attr;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode | null>(null);
  useEffect(() => setMode(current()), []);

  function toggle() {
    const next: Mode = (mode ?? current()) === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("hang-theme", next); } catch {}
    setMode(next);
  }

  return (
    <button type="button" className="btn btn-quiet" style={{ minHeight: "2.25rem", padding: "0.3rem 0.8rem" }} onClick={toggle} aria-pressed={mode === "dark"} aria-label="Dark mode">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" />
      </svg>
      <span className="text-[0.85rem]">{mode === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
