import "server-only";
import { searchGoogleBooks } from "./google-books";
import { mergeResults } from "./merge";
import { searchOpenLibrary } from "./open-library";
import { signRecord } from "./token";
import type { SearchResult } from "./types";

export type ProviderSearch = { results: SearchResult[]; unavailable: string[] };

/** Both providers at once, each with its own deadline; either can fail alone. */
export async function searchProviders(query: string): Promise<ProviderSearch> {
  const [ol, gb] = await Promise.allSettled([searchOpenLibrary(query), searchGoogleBooks(query)]);
  const unavailable: string[] = [];
  if (ol.status === "rejected") {
    unavailable.push("Open Library");
    console.warn("[commonplace] Open Library:", ol.reason instanceof Error ? ol.reason.message : ol.reason);
  }
  if (gb.status === "rejected") {
    unavailable.push("Google Books");
    console.warn("[commonplace] Google Books:", gb.reason instanceof Error ? gb.reason.message : gb.reason);
  }
  const merged = mergeResults(ol.status === "fulfilled" ? ol.value : [], gb.status === "fulfilled" ? gb.value : []);
  return { results: merged.map((record) => ({ record, token: signRecord(record) })), unavailable };
}
