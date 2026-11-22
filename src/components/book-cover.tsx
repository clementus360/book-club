"use client";

import { useState } from "react";

type CoverBook = { title: string; authors: string[]; cover_url: string | null };

/**
 * A real cover when there is one. Underneath is always a plain title label
 * (never an invented design), so nothing is blank while a cover loads or if it
 * never arrives.
 */
export function BookCover({ book, className = "w-24", decorative = true, priority = false }: {
  book: CoverBook; className?: string; decorative?: boolean; priority?: boolean;
}) {
  // Remember which URL failed, so a corrected cover gets another chance.
  const [failed, setFailed] = useState<string | null>(null);
  const src = book.cover_url && book.cover_url !== failed ? book.cover_url : null;
  // Open Library answers with a 1x1 image when a cover is missing.
  const broken = (img: HTMLImageElement) => img.naturalWidth < 10;
  return (
    <span role={decorative ? undefined : "img"} aria-label={decorative ? undefined : `Cover of ${book.title}`} aria-hidden={decorative || undefined}
      className={`@container relative block aspect-[2/3] shrink-0 overflow-hidden bg-[#e6e1d5] shadow-[0_1px_2px_rgb(33_31_27/0.22),0_4px_12px_rgb(33_31_27/0.1)] ${className}`}>
      <span className="absolute inset-0 flex flex-col border border-rule p-[9%]">
        <span className="mb-[8%] block h-[3px] w-1/4 bg-rubric/70" />
        <span className="hidden flex-1 flex-col overflow-hidden @min-[3.75rem]:flex">
          <span className="line-clamp-5 font-serif leading-[1.2] [overflow-wrap:anywhere] hyphens-auto" style={{ fontSize: "clamp(0.5rem, 12cqw, 1.5rem)" }}>{book.title}</span>
          <span className="mt-auto line-clamp-2 leading-tight text-soft" style={{ fontSize: "clamp(0.45rem, 8cqw, 0.875rem)" }}>{book.authors.join(", ")}</span>
        </span>
      </span>
      {src && (
        // Provider covers vary in size and host; next/image would add nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src} alt="" loading={priority ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
          // An image can fail before hydration, when onError is not yet attached.
          ref={(img) => { if (img?.complete && broken(img)) setFailed(src); }}
          onError={() => setFailed(src)}
          onLoad={(e) => { if (broken(e.currentTarget)) setFailed(src); }}
        />
      )}
    </span>
  );
}
