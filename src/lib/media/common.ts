import "server-only";
import type { BookRecord, BookSource } from "@/lib/books/types";
import type { Kind } from "@/lib/kinds";

/** A record with nothing filled in yet, so each source only sets what it knows. */
export function blank(kind: Kind, source: BookSource, externalId: string, title: string): BookRecord {
  return {
    title, original_title: null, alternative_titles: [], subtitle: null, authors: [], description: null, cover_url: null,
    publisher: null, publication_date: null, publication_year: null, language: null, isbn_10: null, isbn_13: null, format: null,
    series_title: null, volume_number: null, page_count: null, open_library_work_id: null, open_library_edition_id: null,
    google_books_id: null, metadata_source: source, kind, external_id: externalId, episodes: null, runtime_minutes: null,
    play_hours: null, platforms: [],
  };
}

/** JSON from a source, with a time limit. Throws on anything but success, so search can say the source is unavailable. */
export async function getJson<T>(url: URL | string, { signal, timeout = 6000, init, cache = 86_400, name }: {
  signal?: AbortSignal; timeout?: number; init?: RequestInit; cache?: number | false; name: string;
}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.any([AbortSignal.timeout(timeout), ...(signal ? [signal] : [])]),
    ...(cache === false ? { cache: "no-store" as const } : { next: { revalidate: cache } }),
  });
  if (!res.ok) throw new Error(`${name} responded ${res.status}`);
  return (await res.json()) as T;
}

/** A whole number in range, or null. */
export const count = (v: unknown, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max ? v : null);

export const yearFrom = (date: string | null | undefined) => {
  const y = Number(date?.slice(0, 4));
  return Number.isInteger(y) && y > 1800 && y < 2200 ? y : null;
};

const NAMES: Record<string, string> = {
  english: "en", japanese: "ja", korean: "ko", chinese: "zh", mandarin: "zh", cantonese: "zh", spanish: "es", french: "fr",
  german: "de", italian: "it", portuguese: "pt", hindi: "hi", swedish: "sv", danish: "da", norwegian: "no", finnish: "fi",
  turkish: "tr", russian: "ru", dutch: "nl", polish: "pl", arabic: "ar", thai: "th", swahili: "sw", kinyarwanda: "rw",
};
/** TVmaze names languages in English: "Japanese" becomes "ja". */
export const languageFromName = (name: string | null | undefined) => (name ? NAMES[name.trim().toLowerCase()] ?? null : null);

/** Game platforms, from whatever a source calls them, to the families members can say they own. */
export function platformFamilies(names: string[]): string[] {
  const out = new Set<string>();
  for (const raw of names) {
    const n = raw.toLowerCase();
    if (/\bpc\b|windows|microsoft windows|dos\b/.test(n)) out.add("pc");
    if (/\bmac\b|macos|os x/.test(n)) out.add("mac");
    if (/linux|steamos/.test(n)) out.add("linux");
    if (/playstation|\bps[1-5]\b|\bps vita\b/.test(n)) out.add("playstation");
    if (/xbox/.test(n)) out.add("xbox");
    if (/switch/.test(n)) out.add("switch");
    if (/\bios\b|iphone|ipad/.test(n)) out.add("ios");
    if (/android/.test(n)) out.add("android");
  }
  return [...out];
}
