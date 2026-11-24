import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

// What a link to the site shows when it is shared: the logo, in the brand's colours.
export const alt = `${BRAND.name}: ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const c = BRAND.colors;
  const logo = `data:image/svg+xml;base64,${(await readFile(join(process.cwd(), "public/brand/logo.svg"))).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: c.paper, color: c.ink }}>
        <img src={logo} alt="" width={398} height={130} />
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, display: "flex", flexDirection: "column" }}>
            <span>Good stories.</span>
            <span style={{ color: c.flame }}>Better conversations.</span>
          </div>
          <div style={{ fontSize: 30, color: c.soft, maxWidth: 940 }}>Choose together, enjoy it together, and keep a record of the conversation. For book, film, TV, anime and game clubs.</div>
        </div>
      </div>
    ),
    size,
  );
}
