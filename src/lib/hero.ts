import generated from "./hero.generated.json";

/**
 * Where the character stands before it starts to grow, as shares of the whole
 * graphic: `width` of it, with its middle at `x` and the top of its head at `y`
 * (0 is the very top, above the paint).
 */
export type Placement = { width: number; x: number; y: number };
export type HeroSlide = {
  id: string;
  /** Said to people who cannot see the picture. */
  alt: string;
  /** Named quietly under the artwork. */
  book: { title: string; author: string | null };
  characterRatio: number;
  widths: { background: number[]; character: number[] };
  character: Placement;
  grow: { background: readonly [number, number]; character: readonly [number, number] };
};

/** The character grows faster than what is behind it, which is what gives depth. */
export const GROW = { background: [1.02, 1.045], character: [1.02, 1.095] } as const;
/** Seconds to grow that far: a bigger number is slower. */
export const GROW_OVER = 28;
/** Seconds each slide stays when there are several. It keeps growing at the same speed, for less time. */
export const SHOWN = 12;
/** Seconds it takes to paint one slide over another. */
export const CHANGE = 2.2;

/**
 * Everything here is optional. Slides come from scripts/hero-art.mjs (put a
 * folder in hero-art/ and run `npm run hero`); this is for adjusting one.
 */
const ADJUST: Record<string, { alt?: string; book?: Partial<HeroSlide["book"]>; character?: Partial<Placement>; grow?: Partial<HeroSlide["grow"]> }> = {
  "percy-jackson": {
    book: { title: "Percy Jackson & the Olympians", author: "Rick Riordan" },
    alt: "Percy Jackson and two friends step out of a stormy sea, the one in front holding a golden sword.",
    character: { width: 0.83, x: 0.535, y: 0.135 },
  },
  "dungeon-crawler-carl": {
    book: { author: "Matt Dinniman" },
    alt: "Carl, in a leather jacket and heart-patterned shorts, charges out of a dungeon with Princess Donut, his cat.",
  },
  "the-maze-runner": {
    book: { author: "James Dashner" },
    alt: "A group of young runners sprint away from the towering, ivy-covered walls of the maze.",
    character: { width: 0.79, x: 0.51, y: 0.262 },
  },
  "into-the-spider-verse": {
    book: { title: "Spider-Man: Into the Spider-Verse", author: "An animated film" },
    alt: "Miles Morales, Gwen Stacy and Peter Parker leap across a bright sky in their Spider-Man suits.",
    character: { width: 0.8, x: 0.52, y: 0.38 },
  },
  arcane: {
    book: { title: "Arcane", author: "A series by Christian Linke and Alex Yee" },
    alt: "Jinx, with long blue braids, looks out from a neon-lit city.",
  },
  "breaking-bad": {
    book: { title: "Breaking Bad", author: "A series by Vince Gilligan" },
    alt: "Walter White sits in a yellow protective suit, staring straight ahead.",
  },
  "chainsaw-man": {
    book: { title: "Chainsaw Man", author: "An anime by MAPPA" },
    alt: "Denji, with a chainsaw for a head and chainsaws for arms, leaps forward.",
    character: { width: 0.76, x: 0.51 },
  },
};

export const STAGE = { ratio: generated.stageRatio, rise: generated.rise as [number, number] };

const HEAD = 0.135; // clear of the paint's top edge
const FEET = 0.9; // below its bottom edge

/** A sensible place for any character: head above the paint, feet behind its lower edge. */
export function place(characterRatio: number): Placement {
  const tall = ((FEET - HEAD) * characterRatio) / STAGE.ratio; // the width that reaches from head to feet
  const width = Math.min(0.83, tall);
  const height = (width / characterRatio) * STAGE.ratio;
  return { width, x: 0.52, y: Math.max(HEAD, FEET - height) };
}

const title = (id: string) => id.split("-").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");

export const HERO_SLIDES: HeroSlide[] = generated.slides.map(({ id, characterRatio, background, character }) => {
  const own = ADJUST[id] ?? {};
  return {
    id, characterRatio, widths: { background, character },
    book: { title: title(id), author: null, ...own.book },
    alt: own.alt ?? `Artwork inspired by ${title(id)}.`,
    character: { ...place(characterRatio), ...own.character },
    grow: { ...GROW, ...own.grow },
  };
});

export const UNUSED_ADJUSTMENTS = Object.keys(ADJUST).filter((id) => !generated.slides.some((s) => s.id === id));
