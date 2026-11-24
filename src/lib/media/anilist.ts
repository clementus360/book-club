import "server-only";
import { plainText, trustedCover } from "@/lib/books/normalize";
import type { BookRecord } from "@/lib/books/types";
import { blank, count, getJson } from "./common";

// Anime, from AniList. No key. Free unless the app earns more than $150 a
// month; past that AniList asks for a commercial licence.

const base = () => process.env.ANILIST_URL || "https://graphql.anilist.co";

type Media = {
  id?: number; title?: { romaji?: string | null; english?: string | null; native?: string | null }; synonyms?: string[];
  episodes?: number | null; startDate?: { year?: number | null }; coverImage?: { large?: string | null; medium?: string | null };
  description?: string | null; studios?: { nodes?: { name?: string }[] }; isAdult?: boolean;
  externalLinks?: { url?: string; site?: string; type?: string }[];
};

const FIELDS = `id title { romaji english native } synonyms episodes startDate { year } coverImage { large medium }
  description(asHtml: false) studios(isMain: true) { nodes { name } } isAdult`;

async function ask<T>(query: string, variables: Record<string, unknown>, signal?: AbortSignal, cache: number | false = 86_400): Promise<T> {
  // AniList answers queries by POST; Next caches a POST fetch only when told to.
  return getJson<T>(base(), {
    signal, name: "AniList", cache,
    init: { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query, variables }) },
  });
}

export function fromAnilist(m: Media): BookRecord | null {
  const title = m.title?.english || m.title?.romaji;
  if (!m.id || !title || m.isAdult) return null;
  const r = blank("anime", "anilist", String(m.id), title);
  r.original_title = m.title?.native ?? null;
  r.alternative_titles = [...new Set([m.title?.romaji, ...(m.synonyms ?? [])].filter((t): t is string => Boolean(t) && t !== title))].slice(0, 8);
  r.episodes = count(m.episodes, 20_000);
  r.publication_year = count(m.startDate?.year, 2200);
  r.cover_url = trustedCover(m.coverImage?.large ?? m.coverImage?.medium);
  r.description = plainText(m.description);
  r.authors = (m.studios?.nodes ?? []).flatMap((s) => (s.name ? [s.name] : [])).slice(0, 4);
  r.language = "ja";
  return r;
}

export async function searchAnilist(query: string, signal?: AbortSignal): Promise<BookRecord[]> {
  const body = await ask<{ data?: { Page?: { media?: Media[] } } }>(
    `query ($search: String) { Page(perPage: 12) { media(search: $search, type: ANIME, isAdult: false, sort: SEARCH_MATCH) { ${FIELDS} } } }`,
    { search: query }, signal);
  return (body.data?.Page?.media ?? []).flatMap((m) => fromAnilist(m) ?? []);
}

/** Legal places to stream it, as AniList lists them. */
export async function anilistStreams(id: string): Promise<{ site: string; url: string }[]> {
  if (!/^\d+$/.test(id)) return [];
  try {
    const body = await ask<{ data?: { Media?: Media } }>(
      `query ($id: Int) { Media(id: $id, type: ANIME) { externalLinks { url site type } } }`, { id: Number(id) });
    return (body.data?.Media?.externalLinks ?? [])
      .filter((l) => l.type === "STREAMING" && l.site && l.url?.startsWith("https://"))
      .map((l) => ({ site: l.site!, url: l.url! }))
      .slice(0, 6);
  } catch {
    return [];
  }
}
