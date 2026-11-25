import generated from "./hero.generated.json";

/**
 * Where the character stands before it starts to grow, as shares of the whole
 * graphic: `width` of it, with its middle at `x` and the top of its head at `y`
 * (0 is the very top, above the paint).
 */
export type Placement = { width: number; x: number; y: number };
/** "Photo by {by} on {site}", each linked, as the photo sites ask. */
export type Credit = { by: string; href: string; site: "Unsplash" | "Pexels"; photo: string };
export type HeroSlide = {
  id: string;
  /** Said to people who cannot see the picture. */
  alt: string;
  /** Named quietly under the artwork, with who took the photograph. */
  title: string;
  credit: Credit;
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
const ADJUST: Record<string, { title?: string; alt?: string; character?: Partial<Placement>; grow?: Partial<HeroSlide["grow"]> }> = {
  "orange-dress": {
    title: "Woman in orange dress holding oranges",
    alt: "A woman in a billowing orange dress holds an orange up to her ear, in front of a market stall.",
  },
  "red-motorbike": {
    title: "Young man on a red motorbike in a bustling market",
    alt: "A young man in a white T-shirt leans on the handlebars of a red motorbike in a busy street market.",
    character: { width: 0.78, x: 0.53 },
  },
  "roys-motel": {
    title: "Roy’s Motel and Cafe desert sign",
    alt: "The star-shaped sign of Roy’s Motel and Cafe stands over a desert petrol station on Route 66.",
  },
  braids: {
    title: "Young girl with braided hair",
    alt: "A girl with braided hair rests her chin on her knee and looks straight ahead, in black and white.",
  },
};

const UNSPLASH = (by: string, user: string, photo: string): Credit => ({ by, href: `https://unsplash.com/@${user}`, site: "Unsplash", photo: `https://unsplash.com/photos/${photo}` });
/** Every slide needs one, taken from the photo's own page. */
export const CREDITS: Record<string, Credit> = {
  "orange-dress": UNSPLASH("Christian Agbede", "chriscreations__", "AvNRrrZjNaI"),
  "red-motorbike": { by: "Dang Vu Hai", href: "https://www.pexels.com/@dang-vu-hai-683750211/", site: "Pexels", photo: "https://www.pexels.com/photo/34791085/" },
  "roys-motel": UNSPLASH("Thomas Drechsler", "thomasdrechsler", "AOa8k6-ixkI"),
  braids: UNSPLASH("Adewale Shobaloju", "ogidan", "GLnliNAykYA"),
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
    title: own.title ?? title(id),
    credit: CREDITS[id]!,
    alt: own.alt ?? `A photograph: ${title(id)}.`,
    character: { ...place(characterRatio), ...own.character },
    grow: { ...GROW, ...own.grow },
  };
});

export const UNUSED_ADJUSTMENTS = [...Object.keys(ADJUST), ...Object.keys(CREDITS)].filter((id) => !generated.slides.some((s) => s.id === id));
export const UNCREDITED = generated.slides.map((s) => s.id).filter((id) => !CREDITS[id]);
