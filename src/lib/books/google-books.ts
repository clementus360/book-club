import "server-only";
import { asIsbn, inferFormat, normalizeLanguage, parseVolume, pickIsbns, plainText, trustedCover, yearOf } from "./normalize";
import type { BookRecord } from "./types";

const base = () => process.env.GOOGLE_BOOKS_URL ?? "https://www.googleapis.com";

export type GoogleVolume = {
  id?: string;
  volumeInfo?: {
    title?: string; subtitle?: string; authors?: string[]; description?: string; publisher?: string;
    publishedDate?: string; language?: string; pageCount?: number; categories?: string[];
    industryIdentifiers?: { type?: string; identifier?: string }[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    seriesInfo?: { bookDisplayNumber?: string };
  };
};

export function fromGoogle(volume: GoogleVolume): BookRecord | null {
  const v = volume.volumeInfo;
  if (!volume.id || !v?.title) return null;
  const parsed = parseVolume(v.title) ?? (v.subtitle ? parseVolume(`${v.title}: ${v.subtitle}`) : null);
  const number = v.seriesInfo?.bookDisplayNumber?.trim();
  const pages = v.pageCount;
  return {
    title: v.title,
    original_title: null,
    alternative_titles: [],
    subtitle: v.subtitle ?? null,
    authors: (v.authors ?? []).slice(0, 8),
    description: plainText(v.description),
    cover_url: trustedCover(v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail),
    publisher: v.publisher ?? null,
    publication_date: v.publishedDate ?? null,
    publication_year: yearOf(v.publishedDate),
    language: normalizeLanguage(v.language),
    ...pickIsbns(v.industryIdentifiers?.map((i) => i.identifier ?? "")),
    format: inferFormat(v.categories ?? []),
    series_title: parsed?.series ?? null,
    volume_number: parsed?.volume ?? (number && number.length <= 20 ? number : null),
    page_count: pages && Number.isInteger(pages) && pages > 0 && pages <= 50_000 ? pages : null,
    open_library_work_id: null,
    open_library_edition_id: null,
    google_books_id: volume.id,
    metadata_source: "google_books",
  };
}

export async function searchGoogleBooks(query: string, signal?: AbortSignal): Promise<BookRecord[]> {
  const url = new URL(`${base()}/books/v1/volumes`);
  const isbn = asIsbn(query);
  url.searchParams.set("q", isbn ? `isbn:${isbn}` : query);
  url.searchParams.set("maxResults", "12");
  url.searchParams.set("printType", "books");
  if (process.env.GOOGLE_BOOKS_API_KEY) url.searchParams.set("key", process.env.GOOGLE_BOOKS_API_KEY);
  const res = await fetch(url, { signal: AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]), next: { revalidate: 86_400 } });
  if (!res.ok) throw new Error(`Google Books responded ${res.status}`);
  const body = (await res.json()) as { items?: GoogleVolume[] };
  return (body.items ?? []).flatMap((v) => fromGoogle(v) ?? []);
}
