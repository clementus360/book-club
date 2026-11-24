import "server-only";
import { plainText, trustedCover } from "@/lib/books/normalize";
import type { BookRecord } from "@/lib/books/types";
import { blank, count, getJson, platformFamilies, yearFrom } from "./common";

// Games. IGDB (needs a free Twitch developer app: TWITCH_CLIENT_ID and
// TWITCH_CLIENT_SECRET) is used when set up; otherwise RAWG (RAWG_API_KEY).
// Both ask to be credited where their data is shown.

export const igdbReady = () => Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
export const rawgReady = () => Boolean(process.env.RAWG_API_KEY);
export const gameSource = (): "igdb" | "rawg" | null => (igdbReady() ? "igdb" : rawgReady() ? "rawg" : null);

// ---------------------------------------------------------------------- IGDB

const igdbBase = () => process.env.IGDB_URL || "https://api.igdb.com";
const tokenUrl = () => process.env.TWITCH_TOKEN_URL || "https://id.twitch.tv/oauth2/token";

let token: { value: string; until: number } | null = null;

/** An app token from Twitch, kept until shortly before it expires (about two months). */
async function igdbToken(signal?: AbortSignal): Promise<string> {
  if (token && token.until > Date.now()) return token.value;
  const url = new URL(tokenUrl());
  url.searchParams.set("client_id", process.env.TWITCH_CLIENT_ID ?? "");
  url.searchParams.set("client_secret", process.env.TWITCH_CLIENT_SECRET ?? "");
  url.searchParams.set("grant_type", "client_credentials");
  const body = await getJson<{ access_token?: string; expires_in?: number }>(url, { signal, name: "Twitch", cache: false, init: { method: "POST" } });
  if (!body.access_token) throw new Error("Twitch gave no token");
  token = { value: body.access_token, until: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 300) * 1000 };
  return token.value;
}

async function igdb<T>(endpoint: string, query: string, signal?: AbortSignal, retry = true): Promise<T> {
  const bearer = await igdbToken(signal);
  try {
    return await getJson<T>(`${igdbBase()}/v4/${endpoint}`, {
      signal, name: "IGDB", cache: 86_400,
      init: { method: "POST", headers: { "Client-ID": process.env.TWITCH_CLIENT_ID ?? "", Authorization: `Bearer ${bearer}`, Accept: "application/json" }, body: query },
    });
  } catch (error) {
    // A token Twitch has since revoked: get a new one, once.
    if (retry && error instanceof Error && /responded 401/.test(error.message)) { token = null; return igdb(endpoint, query, signal, false); }
    throw error;
  }
}

type IgdbGame = {
  id?: number; name?: string; first_release_date?: number; summary?: string; cover?: { image_id?: string };
  platforms?: { name?: string }[]; involved_companies?: { developer?: boolean; company?: { name?: string } }[];
  alternative_names?: { name?: string }[];
};

export function fromIgdb(g: IgdbGame): BookRecord | null {
  if (!g.id || !g.name) return null;
  const r = blank("game", "igdb", String(g.id), g.name);
  const released = g.first_release_date ? new Date(g.first_release_date * 1000) : null;
  r.publication_year = released ? released.getUTCFullYear() : null;
  r.publication_date = released ? released.toISOString().slice(0, 10) : null;
  r.cover_url = g.cover?.image_id && /^\w+$/.test(g.cover.image_id) ? trustedCover(`https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`) : null;
  r.description = plainText(g.summary);
  r.platforms = platformFamilies((g.platforms ?? []).flatMap((p) => (p.name ? [p.name] : [])));
  r.authors = [...new Set((g.involved_companies ?? []).filter((c) => c.developer && c.company?.name).map((c) => c.company!.name!))].slice(0, 4);
  r.alternative_titles = [...new Set((g.alternative_names ?? []).flatMap((a) => (a.name && a.name !== g.name ? [a.name] : [])))].slice(0, 6);
  return r;
}

/** IGDB's query language takes the search in double quotes. */
const quoted = (s: string) => `"${s.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim()}"`;

export async function searchIgdb(query: string, signal?: AbortSignal): Promise<BookRecord[]> {
  const body = await igdb<IgdbGame[]>("games",
    `search ${quoted(query)}; fields name,first_release_date,summary,cover.image_id,platforms.name,involved_companies.developer,involved_companies.company.name,alternative_names.name; limit 12;`,
    signal);
  return (Array.isArray(body) ? body : []).flatMap((g) => fromIgdb(g) ?? []);
}

async function igdbHours(id: string): Promise<number | null> {
  try {
    const rows = await igdb<{ normally?: number; hastily?: number }[]>("game_time_to_beats", `fields normally,hastily; where game_id = ${Number(id)};`);
    const seconds = rows?.[0]?.normally ?? rows?.[0]?.hastily;
    return seconds ? count(Math.max(1, Math.round(seconds / 3600)), 5000) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------- RAWG

const rawgBase = () => process.env.RAWG_URL || "https://api.rawg.io";

type RawgGame = { id?: number; name?: string; released?: string | null; background_image?: string | null; platforms?: { platform?: { name?: string } }[] | null; playtime?: number };

export function fromRawg(g: RawgGame): BookRecord | null {
  if (!g.id || !g.name) return null;
  const r = blank("game", "rawg", String(g.id), g.name);
  r.publication_date = g.released || null;
  r.publication_year = yearFrom(g.released);
  r.cover_url = trustedCover(g.background_image);
  r.platforms = platformFamilies((g.platforms ?? []).flatMap((p) => (p.platform?.name ? [p.platform.name] : [])));
  r.play_hours = count(g.playtime, 5000);
  return r;
}

export async function searchRawg(query: string, signal?: AbortSignal): Promise<BookRecord[]> {
  const url = new URL(`${rawgBase()}/api/games`);
  url.searchParams.set("key", process.env.RAWG_API_KEY ?? "");
  url.searchParams.set("search", query);
  url.searchParams.set("page_size", "12");
  const body = await getJson<{ results?: RawgGame[] }>(url, { signal, name: "RAWG" });
  return (body.results ?? []).flatMap((g) => fromRawg(g) ?? []);
}

// ------------------------------------------------------------------- either

export const searchGames = (query: string, signal?: AbortSignal) => (igdbReady() ? searchIgdb(query, signal) : searchRawg(query, signal));
export const gameSourceName = () => (igdbReady() ? "IGDB" : "RAWG");

/** Developers, description and how long it takes. Best effort. */
export async function enrichGame(record: BookRecord): Promise<BookRecord> {
  const id = record.external_id;
  if (!id || !/^\d+$/.test(id)) return record;
  if (record.metadata_source === "igdb" && igdbReady()) {
    const hours = await igdbHours(id);
    return { ...record, play_hours: record.play_hours ?? hours };
  }
  if (record.metadata_source === "rawg" && rawgReady()) {
    try {
      const url = new URL(`${rawgBase()}/api/games/${id}`);
      url.searchParams.set("key", process.env.RAWG_API_KEY ?? "");
      const g = await getJson<{ description_raw?: string; developers?: { name?: string }[] }>(url, { name: "RAWG", timeout: 4000, cache: 604_800 });
      return {
        ...record,
        description: record.description ?? plainText(g.description_raw),
        authors: record.authors.length ? record.authors : (g.developers ?? []).flatMap((d) => (d.name ? [d.name] : [])).slice(0, 4),
      };
    } catch {
      return record;
    }
  }
  return record;
}
