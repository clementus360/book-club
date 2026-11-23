import "server-only";
import { enrichFromOpenLibrary } from "@/lib/books/open-library";
import type { BookRecord } from "@/lib/books/types";
import { enrichGame } from "./games";
import { enrichFromTmdb } from "./tmdb";
import { enrichFromTvmaze } from "./tvmaze";

/** Details a search result leaves out, fetched once when it is added. Never blocks adding. */
export function enrich(record: BookRecord): Promise<BookRecord> {
  switch (record.metadata_source) {
    case "open_library": case "google_books": return enrichFromOpenLibrary(record);
    case "tmdb": return enrichFromTmdb(record);
    case "tvmaze": return enrichFromTvmaze(record);
    case "igdb": case "rawg": return enrichGame(record);
    default: return Promise.resolve(record);
  }
}
