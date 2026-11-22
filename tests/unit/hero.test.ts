import { existsSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import generated from "@/lib/hero.generated.json";
import { CHANGE, HERO_SLIDES, place, SHOWN, STAGE, UNUSED_ADJUSTMENTS } from "@/lib/hero";

const alpha = async (name: string) => {
  const { data, info } = await sharp(`public/hero/${name}`).extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};

describe("hero masks", () => {
  it("open upwards only: sides and bottom are the splash's own", async () => {
    const [inside, rising] = [await alpha("mask-inside.webp"), await alpha("mask-rising.webp")];
    expect([rising.w, rising.h]).toEqual([inside.w, inside.h]);
    const { w, h } = inside;
    let opened = 0, closed = 0, below = 0, side = 0;
    const [from, to] = generated.rise as [number, number];
    for (let i = 0; i < w * h; i++) {
      const diff = rising.data[i]! - inside.data[i]!;
      if (Math.abs(diff) < 60) continue;
      if (diff < 0) closed++;
      opened++;
      const [x, y] = [(i % w) / w, Math.floor(i / w) / h];
      if (y > 0.6) below++;
      if (x < from - 0.005 || x > to + 0.005) side++;
    }
    expect(opened).toBeGreaterThan(w * h * 0.1); // there is somewhere to rise into
    expect({ closed, below, side }).toEqual({ closed: 0, below: 0, side: 0 });
  });
});

/** Edges of a character when fully grown, as shares of the graphic. */
function grown({ width, x, y }: { width: number; x: number; y: number }, ratio: number, scale: number) {
  const height = (width / ratio) * STAGE.ratio;
  return { head: y - height * (scale - 1), feet: y + height, left: x - (width * scale) / 2 };
}

describe("hero slides", () => {
  it.each(HERO_SLIDES.map((s) => [s.id, s] as const))("%s is never cut by a straight edge, even fully grown", (_, slide) => {
    const edges = grown(slide.character, slide.characterRatio, slide.grow.character[1]);
    expect(edges.head, "top of the head").toBeGreaterThan(0);
    expect(edges.left, "left edge").toBeGreaterThan(STAGE.rise[0]);
    expect(edges.feet, "feet behind the paint").toBeGreaterThan(0.8);
  });
  it.each([0.35, 0.6, 0.9485, 1.2, 1.6])("places any new character safely (width to height %s)", (ratio) => {
    const edges = grown(place(ratio), ratio, 1.095);
    expect(edges.head).toBeGreaterThan(0);
    expect(edges.left).toBeGreaterThan(STAGE.rise[0] - 0.005);
    expect(edges.feet).toBeGreaterThan(0.85);
  });
  it.each(HERO_SLIDES.map((s) => [s.id, s] as const))("%s grows the character faster than the background, and has its files", (id, { grow: { background: bg, character: ch } }) => {
    expect(ch[1] / ch[0]).toBeGreaterThan(bg[1] / bg[0]);
    expect(bg[0]).toBeGreaterThanOrEqual(1); // or the edge of the picture would show
    for (const kind of ["background", "character"] as const) for (const w of HERO_SLIDES.find((s) => s.id === id)!.widths[kind]) for (const t of ["avif", "webp"]) {
      expect(existsSync(`public/hero/${id}-${kind}-${w}.${t}`), `${id}-${kind}-${w}.${t}`).toBe(true);
    }
  });
  it("has a unique, described slide for each id, and no leftover adjustments", () => {
    expect(new Set(HERO_SLIDES.map((s) => s.id)).size).toBe(HERO_SLIDES.length);
    expect(HERO_SLIDES.every((s) => s.alt.length > 15 && s.book.title.length > 2)).toBe(true);
    expect(UNUSED_ADJUSTMENTS).toEqual([]);
    expect(SHOWN).toBeGreaterThan(CHANGE * 2);
  });
});

describe("the brush", () => {
  it("covers everything at one end of its travel and nothing at the other", async () => {
    const { data, w, h } = await alpha("brush.webp");
    const column = (from: number, to: number) => { let min = 255, max = 0; for (let y = 0; y < h; y++) for (let x = Math.round(from * w); x < Math.round(to * w); x++) { const a = data[y * w + x]!; min = Math.min(min, a); max = Math.max(max, a); } return { min, max }; };
    expect(column(0, 1 / 3).min).toBeGreaterThan(250); // painted: the last frame
    expect(column(2 / 3, 1).max).toBeLessThan(5); // bare: the first frame
  });
});
