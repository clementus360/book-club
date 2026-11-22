"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CHANGE, GROW_OVER, SHOWN, STAGE, type HeroSlide } from "@/lib/hero";

function Art({ slide, kind, first }: { slide: HeroSlide; kind: "background" | "character"; first: boolean }) {
  const sizes = kind === "background" ? "(min-width: 64rem) 38rem, 92vw" : "(min-width: 64rem) 31rem, 75vw";
  const widths = slide.widths[kind];
  const set = (type: string) => widths.map((w) => `/hero/${slide.id}-${kind}-${w}.${type} ${w}w`).join(", ");
  return (
    <picture>
      <source type="image/avif" srcSet={set("avif")} sizes={sizes} />
      {/* Pre-sized by scripts/hero-art.mjs, so next/image would only redo the work. */}
      <img src={`/hero/${slide.id}-${kind}-${widths.at(-1)}.webp`} srcSet={set("webp")} sizes={sizes} alt=""
        decoding="async" loading={first ? "eager" : "lazy"} fetchPriority={first && kind === "background" ? "high" : undefined} draggable={false} />
    </picture>
  );
}

type State = "on" | "entering" | "leaving" | "off";

function Slide({ slide, state, first }: { slide: HeroSlide; state: State; first: boolean }) {
  const { background: bg, character: ch } = slide.grow;
  const { width, x, y } = slide.character;
  const vars = {
    "--bg-from": bg[0], "--bg-to": bg[1], "--ch-from": ch[0], "--ch-to": ch[1],
    "--ch-width": `${width * 100}%`, "--ch-x": `${x * 100}%`, "--ch-y": `${y * 100}%`, "--ch-ratio": slide.characterRatio,
    "--ch-shape": `url(/hero/${slide.id}-character-${slide.widths.character[0]}.webp)`,
  } as CSSProperties;
  return (
    <div className="hero-slide" data-state={state} data-slide={slide.id} style={vars} role="img" aria-label={slide.alt} aria-hidden={state === "leaving" || state === "off"}>
      <div className="hero-inside">
        <div className="hero-brush">
          <div className="hero-move hero-background"><Art slide={slide} kind="background" first={first} /></div>
          <div className="hero-texture" />
        </div>
      </div>
      <div className="hero-rising">
        <div className="hero-move hero-character"><Art slide={slide} kind="character" first={first} /><div className="hero-texture" /></div>
      </div>
    </div>
  );
}

/** One slide breathes in and out; several are painted over one another in turn. Both can be paused. */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const many = slides.length > 1;
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [wanted, setWanted] = useState<number | null>(null); // asked for, and still loading
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(true);
  const stage = useRef<HTMLDivElement>(null);
  const moving = playing && visible;

  // A slide is painted on only once its pictures are ready, so the brush never
  // paints a blank. If they are slow, it goes ahead after a few seconds.
  useEffect(() => {
    if (wanted === null || leaving !== null) return;
    let stop = false;
    const pictures = [...(stage.current?.querySelectorAll<HTMLImageElement>(`[data-slide="${slides[wanted]!.id}"] img`) ?? [])];
    const ready = Promise.all(pictures.map((img) => { img.loading = "eager"; return img.decode().catch(() => {}); }));
    const limit = new Promise((resolve) => setTimeout(resolve, 4000));
    void Promise.race([ready, limit]).then(() => {
      if (stop) return;
      setLeaving(index);
      setIndex(wanted);
      setWanted(null);
    });
    return () => { stop = true; };
  }, [wanted, leaving, index, slides]);

  // Nothing runs while it is off screen or in a background tab.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let seen = true;
    const update = () => setVisible(seen && !document.hidden);
    const watch = new IntersectionObserver(([e]) => { seen = Boolean(e?.isIntersecting); update(); });
    watch.observe(el);
    document.addEventListener("visibilitychange", update);
    return () => { watch.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);

  useEffect(() => {
    if (!many || !moving || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => setWanted((index + 1) % slides.length), SHOWN * 1000);
    return () => clearTimeout(timer);
  }, [many, moving, index, slides.length]);

  useEffect(() => {
    if (leaving === null) return;
    const timer = setTimeout(() => setLeaving(null), CHANGE * 1000);
    return () => clearTimeout(timer);
  }, [leaving, index]);

  const upNext = (index + 1) % slides.length;
  return (
    <section aria-roledescription={many ? "carousel" : undefined} aria-label="Artwork" className="hero-art">
      <div ref={stage} className="hero-stage" data-moving={moving} data-many={many}
        style={{ aspectRatio: STAGE.ratio, "--hero-grow-over": `${GROW_OVER}s`, "--hero-change": `${CHANGE}s` } as CSSProperties}>
        {slides.map((s, i) => (i === index || i === leaving || i === wanted || i === upNext) && (
          <Slide key={s.id} slide={s} first={i === 0} state={i === index ? (leaving === null ? "on" : "entering") : i === leaving ? "leaving" : "off"} />
        ))}
      </div>
      <div className="hero-controls">
        {/* Keyed, so each title fades in with its slide. */}
        <p key={slides[index]!.id} className="hero-caption">
          <cite>{slides[index]!.book.title}</cite>
          {slides[index]!.book.author && <span>{slides[index]!.book.author}</span>}
        </p>
        {many && slides.map((s, i) => (
          <button key={s.id} type="button" onClick={() => { if (i !== index) setWanted(i); }} aria-label={`Show ${s.book.title}`} aria-current={i === index ? "true" : undefined} className="hero-dot" />
        ))}
        <button type="button" onClick={() => setPlaying(!playing)} className="hero-pause">
          <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" fill="currentColor">{playing ? <path d="M1 0h3v10H1zM6 0h3v10H6z" /> : <path d="M1 0l9 5-9 5z" />}</svg>
          {playing ? "Pause" : "Play"}<span className="sr-only"> the artwork</span>
        </button>
      </div>
    </section>
  );
}
