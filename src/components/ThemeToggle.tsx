"use client";

import { useSyncExternalStore } from "react";

type Mode = "light" | "dark";

function current(): Mode {
  const attr = document.documentElement.dataset.theme as Mode | undefined;
  if (attr === "light" || attr === "dark") return attr;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Tell React when the theme changes: the data-theme attribute on <html>, or the system setting. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

export function ThemeToggle() {
  // The theme lives on <html>, outside React. On the server (and the first client render) it is unknown: null.
  const mode = useSyncExternalStore<Mode | null>(subscribe, current, () => null);

  function toggle() {
    const next: Mode = (mode ?? current()) === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("hang-theme", next); } catch {}
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
