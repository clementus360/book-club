import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { HERO_SLIDES } from "@/lib/hero";

export const metadata: Metadata = { title: "Credits" };

// TMDB asks for its logo here. Download it from themoviedb.org/about/logos-attribution
// and save it as public/credits/tmdb.svg; until then the notice stands alone.
const tmdbLogo = existsSync(join(process.cwd(), "public/credits/tmdb.svg"));

const SOURCES: { name: string; href: string; what: string; terms?: string }[] = [
  { name: "Open Library", href: "https://openlibrary.org", what: "Book details and covers, and which books can be borrowed." },
  { name: "Internet Archive", href: "https://archive.org", what: "Which books can be borrowed or read free, through Open Library." },
  { name: "Google Books", href: "https://books.google.com", what: "Book details, covers, and where e-books can be read or bought." },
  { name: "The Movie Database (TMDB)", href: "https://www.themoviedb.org", what: "Film details and posters.", terms: "This product uses the TMDB API but is not endorsed or certified by TMDB." },
  { name: "JustWatch", href: "https://www.justwatch.com", what: "Where films can be streamed, rented or bought, through TMDB." },
  { name: "TVmaze", href: "https://www.tvmaze.com", what: "Series details and images.", terms: "Used under the Creative Commons Attribution-ShareAlike licence (CC BY-SA 4.0)." },
  { name: "AniList", href: "https://anilist.co", what: "Anime details and images." },
  { name: "IGDB", href: "https://www.igdb.com", what: "Game details and covers." },
  { name: "RAWG", href: "https://rawg.io", what: "Game details and covers, where IGDB is not used." },
];

export default function Credits() {
  return (
    <article className="max-w-2xl pt-14 lg:pt-20 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_p]:mb-4">
      <h1 className="page-title">Credits</h1>
      <p className="page-lede !mb-10">{BRAND.name} stands on the work of these services and the people behind them. Thank you.</p>
      {tmdbLogo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/credits/tmdb.svg" alt="The Movie Database (TMDB)" className="mb-8 h-6 w-auto" />
      )}
      <dl>
        {SOURCES.map((s) => (
          <div key={s.name} className="border-t border-rule py-4">
            <dt><a className="link" href={s.href} target="_blank" rel="noopener noreferrer">{s.name}</a></dt>
            <dd className="mt-1 text-soft">{s.what}{s.terms && <span className="mt-1 block">{s.terms}</span>}</dd>
          </div>
        ))}
      </dl>
      <h2>Homepage photographs</h2>
      <p>Used under the <a className="link" href="https://unsplash.com/license" target="_blank" rel="noopener noreferrer">Unsplash</a> and <a className="link" href="https://www.pexels.com/license/" target="_blank" rel="noopener noreferrer">Pexels</a> licences. Backgrounds and figures were cut out and combined for the homepage.</p>
      <ul>
        {HERO_SLIDES.map((s) => (
          <li key={s.id} className="border-t border-rule py-3">
            <a className="link" href={s.credit.photo} target="_blank" rel="noopener noreferrer">{s.title}</a>
            <span className="text-soft">{" by "}<a className="link" href={s.credit.href} target="_blank" rel="noopener noreferrer">{s.credit.by}</a>{` on ${s.credit.site}`}</span>
          </li>
        ))}
      </ul>
      <h2>Members</h2>
      <p>Everything else, from manual entries to discussion notes, is written by the members of each club.</p>
    </article>
  );
}
