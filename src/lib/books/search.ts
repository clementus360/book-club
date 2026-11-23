import "server-only";
import { searchGoogleBooks } from "./google-books";
import { mergeResults, isSamePublication, fillGaps } from "./merge";
import { searchOpenLibrary } from "./open-library";
import { signRecord } from "./token";
import type { BookRecord, SearchResult } from "./types";

export type ProviderSearch = { results: SearchResult[]; unavailable: string[] };
export type ProviderProgress = ProviderSearch & { waiting: string[] };

/** Answers this close together are shown together, interleaved, rather than one after the other. */
const TOGETHER = 250;
/** Once one catalogue has answered, how long (from the start) the other may still take. */
const ONCE_ONE_ANSWERED = 4000;
const LIMIT = 20;

/** Adds later results after those already shown, so nothing moves under someone's finger. */
export function appendResults(shown: BookRecord[], later: BookRecord[], limit = LIMIT): BookRecord[] {
  const out = [...shown];
  for (const record of later) {
    const i = out.findIndex((o) => isSamePublication(o, record));
    if (i >= 0) out[i] = fillGaps(out[i]!, record);
    else if (out.length < limit) out.push(record);
  }
  return out;
}

/**
 * Both catalogues at once. Whatever arrives first is passed to `onUpdate`
 * straight away, so a slow catalogue never holds up a fast one.
 */
export async function searchProviders(query: string, { signal, onUpdate, together = TOGETHER, onceOneAnswered = ONCE_ONE_ANSWERED }: { signal?: AbortSignal; onUpdate?: (p: ProviderProgress) => void; together?: number; onceOneAnswered?: number } = {}): Promise<ProviderSearch> {
  const started = Date.now();
  const providers = [
    { name: "Open Library", stop: new AbortController(), run: searchOpenLibrary },
    { name: "Google Books", stop: new AbortController(), run: searchGoogleBooks },
  ];
  const answers = new Map<string, BookRecord[] | null>(); // null: could not be reached
  let shown: BookRecord[] = [];
  let flushed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const ordered = () => providers.map((p) => answers.get(p.name) ?? []);
  const progress = (): ProviderProgress => ({
    results: shown.map((record) => ({ record, token: signRecord(record) })),
    unavailable: providers.filter((p) => answers.get(p.name) === null).map((p) => p.name),
    waiting: providers.filter((p) => !answers.has(p.name)).map((p) => p.name),
  });
  const flush = () => {
    clearTimeout(timer);
    if (!flushed) { shown = mergeResults(ordered()[0]!, ordered()[1]!, LIMIT); flushed = true; }
    onUpdate?.(progress());
  };

  await Promise.all(providers.map(async (p) => {
    try {
      const results = await p.run(query, AbortSignal.any([p.stop.signal, ...(signal ? [signal] : [])]));
      answers.set(p.name, results);
      // The other one has had its chance.
      for (const other of providers) if (!answers.has(other.name)) setTimeout(() => other.stop.abort(new Error("took too long")), Math.max(0, started + onceOneAnswered - Date.now()));
    } catch (error) {
      answers.set(p.name, null);
      if (!signal?.aborted) console.warn(`[commonplace] ${p.name}:`, error instanceof Error ? error.message : error);
    }
    if (flushed) { shown = appendResults(shown, answers.get(p.name) ?? []); onUpdate?.(progress()); }
    else if (answers.size === providers.length) flush();
    else timer ??= setTimeout(flush, together);
  }));
  if (!flushed) flush();
  for (const p of providers) p.stop.abort(); // nothing is waiting for them now
  const { results, unavailable } = progress();
  return { results, unavailable };
}
