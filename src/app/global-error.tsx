"use client";

import { BRAND } from "@/lib/brand";

/**
 * When even the root layout fails. It replaces the whole document, so none of
 * the app's styles or fonts are here: everything it needs is inline.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const c = BRAND.colors;
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: c.paper, color: c.ink, fontFamily: "Poppins, system-ui, sans-serif" }}>
        <title>{`Something went wrong · ${BRAND.name}`}</title>
        <main style={{ maxWidth: "32rem", padding: "2rem" }}>
          <p style={{ margin: 0, fontFamily: "system-ui, sans-serif", fontSize: "0.8rem", letterSpacing: "0.08em", textTransform: "uppercase", color: c.rubric }}>{BRAND.name}</p>
          <h1 style={{ fontFamily: "Literata, Georgia, serif", fontWeight: 400, fontSize: "2.2rem", margin: "0.5rem 0 1rem" }}>Something went wrong</h1>
          <p style={{ fontFamily: "system-ui, sans-serif", lineHeight: 1.6, color: c.soft }}>Nothing you saved has been lost. Please try again in a moment.</p>
          {error.digest && <p style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.85rem", color: c.soft }}>Reference: {error.digest}</p>}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem", fontFamily: "system-ui, sans-serif" }}>
            <button onClick={() => retry()} style={{ background: c.leaf, color: c.sheet, border: 0, borderRadius: 8, padding: "0.7rem 1.2rem", fontSize: "1rem", cursor: "pointer" }}>Try again</button>
            {/* A full page load, since the app around this page is what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ color: c.ink, padding: "0.7rem 0.4rem" }}>Go to the homepage</a>
          </div>
        </main>
      </body>
    </html>
  );
}
