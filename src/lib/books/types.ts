import type { Enums } from "@/lib/database.types";
import type { Kind } from "@/lib/kinds";

export type BookFormat = Enums<"book_format">;
export type BookSource = Enums<"book_source">;

/** Commonplace's own shape for a publication. Provider JSON never travels past the adapters. */
export type BookRecord = {
  title: string;
  original_title: string | null;
  alternative_titles: string[];
  subtitle: string | null;
  authors: string[];
  description: string | null;
  cover_url: string | null;
  publisher: string | null;
  publication_date: string | null;
  publication_year: number | null;
  language: string | null;
  isbn_10: string | null;
  isbn_13: string | null;
  format: BookFormat | null;
  series_title: string | null;
  volume_number: string | null;
  page_count: number | null;
  open_library_work_id: string | null;
  open_library_edition_id: string | null;
  google_books_id: string | null;
  metadata_source: BookSource;
  /** Everything below is for films, series, anime and games. A record without `kind` is a book. */
  kind?: Kind;
  /** The source's own identifier, for sources other than Open Library and Google Books. */
  external_id?: string | null;
  episodes?: number | null;
  runtime_minutes?: number | null;
  play_hours?: number | null;
  platforms?: string[];
};

/** A search result the server vouches for. `token` is the signed record. */
export type SearchResult = { record: BookRecord; token: string };

export const FORMAT_LABELS: Record<BookFormat, string> = {
  novel: "Novel",
  nonfiction: "Nonfiction",
  short_stories: "Short stories",
  poetry: "Poetry",
  drama: "Drama",
  manga: "Manga",
  manhua: "Manhua",
  manhwa: "Manhwa",
  light_novel: "Light novel",
  graphic_novel: "Graphic novel",
  comic: "Comic",
  other: "Other",
};

export const SOURCE_LABELS: Record<BookSource, string> = {
  open_library: "Open Library",
  google_books: "Google Books",
  manual: "Entered by hand",
  tmdb: "The Movie Database (TMDB)",
  tvmaze: "TVmaze",
  anilist: "AniList",
  igdb: "IGDB",
  rawg: "RAWG",
};

/** The item's own page at its source: the credit TMDB, TVmaze, AniList, IGDB and RAWG ask for. */
export function sourcePage(b: { metadata_source: BookSource; external_id?: string | null }): string | null {
  const id = b.external_id && /^\d+$/.test(b.external_id) ? b.external_id : null;
  switch (b.metadata_source) {
    case "tmdb": return id && `https://www.themoviedb.org/movie/${id}`;
    case "tvmaze": return id && `https://www.tvmaze.com/shows/${id}`;
    case "anilist": return id && `https://anilist.co/anime/${id}`;
    case "rawg": return id && `https://rawg.io/games/${id}`;
    case "igdb": return "https://www.igdb.com";
    default: return null;
  }
}
