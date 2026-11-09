"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f3f0e8", color: "#15130e", fontFamily: "Georgia, serif", display: "grid", minHeight: "100svh", placeItems: "center", padding: 24 }}>
        <div style={{ maxWidth: 560 }}>
          <h1 style={{ fontSize: "clamp(2.4rem,8vw,4.5rem)", lineHeight: 1, fontWeight: 400, margin: 0 }}>Hang has taken a tumble.</h1>
          <p style={{ fontSize: 18, margin: "20px 0" }}>Something went wrong loading the page.</p>
          <button onClick={reset} style={{ background: "#15130e", color: "#f3f0e8", border: 0, padding: "12px 20px", fontSize: 16, cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
