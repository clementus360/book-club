import "server-only";
import { normalizeLanguage, plainText, trustedCover } from "@/lib/books/normalize";
import type { BookRecord } from "@/lib/books/types";
import { blank, count, getJson, yearFrom } from "./common";

// Films, from The Movie Database. Needs TMDB_API_KEY (the "API Key", v3).
// TMDB asks to be credited, which the book page and privacy page do.

const base = () => process.env.TMDB_URL ?? "https://api.themoviedb.org";
const IMAGES = "https://image.tmdb.org/t/p/w342";
export const tmdbReady = () => Boolean(process.env.TMDB_API_KEY);

type Movie = { id?: number; title?: string; original_title?: string; release_date?: string; poster_path?: string | null; overview?: string; original_language?: string; adult?: boolean };

const withKey = (url: URL) => { url.searchParams.set("api_key", process.env.TMDB_API_KEY ?? ""); return url; };

export function fromTmdb(m: Movie): BookRecord | null {
  if (!m.id || !m.title || m.adult) return null;
  const r = blank("film", "tmdb", String(m.id), m.title);
  r.original_title = m.original_title && m.original_title !== m.title ? m.original_title : null;
  r.publication_date = m.release_date || null;
  r.publication_year = yearFrom(m.release_date);
  r.cover_url = m.poster_path ? trustedCover(`${IMAGES}${m.poster_path}`) : null;
  r.description = plainText(m.overview);
  r.language = normalizeLanguage(m.original_language);
  return r;
}

export async function searchTmdb(query: string, signal?: AbortSignal): Promise<BookRecord[]> {
  const url = withKey(new URL(`${base()}/3/search/movie`));
  url.searchParams.set("query", query);
  url.searchParams.set("include_adult", "false");
  const body = await getJson<{ results?: Movie[] }>(url, { signal, name: "TMDB" });
  return (body.results ?? []).slice(0, 12).flatMap((m) => fromTmdb(m) ?? []);
}

/** Director and runtime are only in the full record. Best effort: never blocks adding a film. */
export async function enrichFromTmdb(record: BookRecord): Promise<BookRecord> {
  if (record.metadata_source !== "tmdb" || !record.external_id || !/^\d+$/.test(record.external_id)) return record;
  try {
    const url = withKey(new URL(`${base()}/3/movie/${record.external_id}`));
    url.searchParams.set("append_to_response", "credits");
    const m = await getJson<{ runtime?: number; credits?: { crew?: { job?: string; name?: string }[] } }>(url, { name: "TMDB", timeout: 4000, cache: 604_800 });
    const directors = (m.credits?.crew ?? []).filter((c) => c.job === "Director" && c.name).map((c) => c.name!);
    return { ...record, runtime_minutes: count(m.runtime, 3000) ?? record.runtime_minutes ?? null, authors: record.authors.length ? record.authors : [...new Set(directors)].slice(0, 6) };
  } catch {
    return record;
  }
}

export type Watch = { link: string; stream: string[]; rent: string[]; buy: string[] };

/** Where a film can be streamed, rented or bought in one country. TMDB has this from JustWatch. */
export async function tmdbWatch(id: string, country: string): Promise<Watch | null> {
  if (!tmdbReady() || !/^\d+$/.test(id)) return null;
  try {
    const body = await getJson<{ results?: Record<string, { link?: string; flatrate?: { provider_name?: string }[]; rent?: { provider_name?: string }[]; buy?: { provider_name?: string }[] }> }>(
      withKey(new URL(`${base()}/3/movie/${id}/watch/providers`)), { name: "TMDB", timeout: 4000 });
    const here = body.results?.[country];
    if (!here?.link?.startsWith("https://")) return null;
    const names = (list?: { provider_name?: string }[]) => [...new Set((list ?? []).flatMap((p) => (p.provider_name ? [p.provider_name] : [])))].slice(0, 6);
    return { link: here.link, stream: names(here.flatrate), rent: names(here.rent), buy: names(here.buy) };
  } catch {
    return null;
  }
}
