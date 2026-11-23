import "server-only";
import { plainText, trustedCover } from "@/lib/books/normalize";
import type { BookRecord } from "@/lib/books/types";
import { blank, getJson, languageFromName, yearFrom } from "./common";

// TV series, from TVmaze. No key. Data is CC BY-SA: credit TVmaze where it is shown.

const base = () => process.env.TVMAZE_URL ?? "https://api.tvmaze.com";

type Show = {
  id?: number; name?: string; premiered?: string | null; language?: string | null; summary?: string | null;
  image?: { medium?: string; original?: string } | null; network?: { name?: string } | null; webChannel?: { name?: string } | null;
  officialSite?: string | null;
};

export function fromTvmaze(s: Show): BookRecord | null {
  if (!s.id || !s.name) return null;
  const r = blank("series", "tvmaze", String(s.id), s.name);
  r.publication_date = s.premiered || null;
  r.publication_year = yearFrom(s.premiered);
  r.cover_url = trustedCover(s.image?.medium ?? s.image?.original);
  r.description = plainText(s.summary);
  r.language = languageFromName(s.language);
  r.publisher = s.webChannel?.name ?? s.network?.name ?? null;
  return r;
}

export async function searchTvmaze(query: string, signal?: AbortSignal): Promise<BookRecord[]> {
  const url = new URL(`${base()}/search/shows`);
  url.searchParams.set("q", query);
  const body = await getJson<{ show?: Show }[]>(url, { signal, name: "TVmaze" });
  return (Array.isArray(body) ? body : []).slice(0, 12).flatMap((x) => (x.show ? fromTvmaze(x.show) ?? [] : []));
}

/** Episode count and creators. Best effort. */
export async function enrichFromTvmaze(record: BookRecord): Promise<BookRecord> {
  if (record.metadata_source !== "tvmaze" || !record.external_id || !/^\d+$/.test(record.external_id)) return record;
  try {
    const url = new URL(`${base()}/shows/${record.external_id}`);
    url.searchParams.append("embed[]", "episodes");
    url.searchParams.append("embed[]", "crew");
    const s = await getJson<{ _embedded?: { episodes?: unknown[]; crew?: { type?: string; person?: { name?: string } }[] } }>(url, { name: "TVmaze", timeout: 4000, cache: 604_800 });
    const episodes = s._embedded?.episodes?.length ?? 0;
    const creators = (s._embedded?.crew ?? []).filter((c) => c.type === "Creator" && c.person?.name).map((c) => c.person!.name!);
    return {
      ...record,
      episodes: episodes > 0 && episodes <= 20_000 ? episodes : record.episodes ?? null,
      authors: record.authors.length ? record.authors : [...new Set(creators)].slice(0, 6),
    };
  } catch {
    return record;
  }
}

/** Where the series is shown, by name and official page if TVmaze knows it. */
export async function tvmazeHome(id: string): Promise<{ channel: string | null; site: string | null } | null> {
  if (!/^\d+$/.test(id)) return null;
  try {
    const s = await getJson<Show>(`${base()}/shows/${id}`, { name: "TVmaze", timeout: 4000 });
    const site = s.officialSite?.startsWith("https://") ? s.officialSite : null;
    return { channel: s.webChannel?.name ?? s.network?.name ?? null, site };
  } catch {
    return null;
  }
}
