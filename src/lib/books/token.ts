import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { secretKey } from "@/lib/env";
import type { BookRecord } from "./types";

// A search result goes to the browser and comes back when chosen. Signing it
// means the catalogue only ever receives records this server fetched itself.

const str = z.string().max(12_000).nullable();
const schema = z.object({
  title: z.string().min(1).max(1000),
  original_title: str, alternative_titles: z.array(z.string()), subtitle: str, authors: z.array(z.string()),
  description: str, cover_url: str, publisher: str, publication_date: str, publication_year: z.number().int().nullable(),
  language: str, isbn_10: str, isbn_13: str, format: z.string().nullable(), series_title: str, volume_number: str,
  page_count: z.number().int().nullable(), open_library_work_id: str, open_library_edition_id: str, google_books_id: str,
  metadata_source: z.enum(["open_library", "google_books", "tmdb", "tvmaze", "anilist", "igdb", "rawg"]),
  kind: z.enum(["book", "film", "series", "anime", "game"]).optional(),
  external_id: str.optional(), episodes: z.number().int().nullable().optional(), runtime_minutes: z.number().int().nullable().optional(),
  play_hours: z.number().int().nullable().optional(), platforms: z.array(z.string()).optional(),
});

const sign = (body: string) =>
  createHmac("sha256", createHmac("sha256", secretKey()).update("commonplace:book-token").digest()).update(body).digest();

/** How long a search result can be chosen. Long enough to read the list, short enough that it cannot be replayed for ever. */
export const TOKEN_LIFETIME_MS = 6 * 60 * 60 * 1000;

export function signRecord(record: BookRecord, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...record, issued_at: now })).toString("base64url");
  return `${body}.${sign(body).toString("base64url")}`;
}

export function readToken(token: string, now = Date.now()): BookRecord | null {
  const [body, mac] = token.split(".");
  if (!body || !mac || token.length > 40_000) return null;
  const given = Buffer.from(mac, "base64url");
  const expected = sign(body);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const parsed = schema.extend({ issued_at: z.number().int() }).safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  if (!parsed.success || now - parsed.data.issued_at > TOKEN_LIFETIME_MS || parsed.data.issued_at > now + 60_000) return null;
  const { issued_at: _issued, ...record } = parsed.data; // eslint-disable-line @typescript-eslint/no-unused-vars
  return record as BookRecord;
}
