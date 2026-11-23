import "server-only";
import { inferFormat, normalizeLanguage, parseVolume, pickIsbns, plainText, yearOf, asIsbn, fold, trustedCover } from "./normalize";
import type { BookRecord } from "./types";

const base = () => process.env.OPEN_LIBRARY_URL ?? "https://openlibrary.org";

function headers(): HeadersInit {
  const contact = process.env.OPEN_LIBRARY_CONTACT;
  return { "User-Agent": `Commonplace/1.0 (private book clubs${contact ? `; ${contact}` : ""})` };
}

type Edition = {
  key?: string; title?: string; subtitle?: string; language?: string[]; isbn?: string[];
  publisher?: string[]; publish_date?: string[]; cover_i?: number;
};
export type OpenLibraryDoc = {
  key?: string; title?: string; subtitle?: string; author_name?: string[]; first_publish_year?: number;
  cover_i?: number; language?: string[]; alternative_title?: string[]; editions?: { docs?: Edition[] };
};

const id = (key: string | undefined) => key?.split("/").pop() ?? null;

export function fromOpenLibrary(doc: OpenLibraryDoc, query: string): BookRecord | null {
  if (!doc.title) return null;
  const edition = doc.editions?.docs?.[0];
  // Open Library returns the edition that best matches the query. Adopt it when
  // it says something the work does not: an ISBN was searched for, or the
  // edition carries a different (usually translated) title.
  const specific = Boolean(edition && (asIsbn(query) || (edition.title && fold(edition.title) !== fold(doc.title))));
  const e = specific ? edition : undefined;
  const title = e?.title ?? doc.title;
  // Sometimes only the work says which volume it is ("海辺のカフカ. 上").
  const volume = parseVolume(title) ?? parseVolume(doc.title);
  const isbns = pickIsbns(e?.isbn);
  const queried = asIsbn(query);
  const cover = e?.cover_i ?? doc.cover_i ?? edition?.cover_i;
  // A different work title is usually the original of a translation, but one
  // that merely extends or shortens this title is just a variant.
  const [mine, theirs] = [fold(title), fold(doc.title)];
  const differs = Boolean(e) && mine !== theirs;
  const variant = differs && (mine.includes(theirs) || theirs.includes(mine));
  const original = differs && !variant ? doc.title : null;
  return {
    title,
    original_title: original,
    alternative_titles: [...(variant ? [doc.title] : []), ...(doc.alternative_title ?? [])].filter((t) => fold(t) !== fold(title)).slice(0, 8),
    subtitle: e?.subtitle ?? doc.subtitle ?? null,
    authors: (doc.author_name ?? []).slice(0, 8),
    description: null,
    cover_url: cover && cover > 0 ? trustedCover(`https://covers.openlibrary.org/b/id/${cover}-L.jpg`) : null,
    publisher: e?.publisher?.[0] ?? null,
    publication_date: e?.publish_date?.[0] ?? null,
    publication_year: yearOf(e?.publish_date?.[0]) ?? doc.first_publish_year ?? null,
    language: normalizeLanguage(e?.language?.[0] ?? (doc.language?.length === 1 ? doc.language[0] : null)),
    isbn_10: isbns.isbn_10 ?? (queried?.length === 10 ? queried : null),
    isbn_13: isbns.isbn_13 ?? (queried?.length === 13 ? queried : null),
    format: null,
    series_title: volume?.series ?? null,
    volume_number: volume?.volume ?? null,
    page_count: null,
    open_library_work_id: id(doc.key),
    open_library_edition_id: e ? id(e.key) : null,
    google_books_id: null,
    metadata_source: "open_library",
  };
}

const FIELDS = [
  "key", "title", "subtitle", "author_name", "first_publish_year", "cover_i", "language", "alternative_title",
  "editions", "editions.key", "editions.title", "editions.subtitle", "editions.language", "editions.isbn",
  "editions.publisher", "editions.publish_date", "editions.cover_i",
].join(",");

/** Open Library takes Lucene syntax and refuses queries under three characters. */
export function toQuery(raw: string): string {
  const isbn = asIsbn(raw);
  if (isbn) return isbn;
  const plain = raw.replace(/[:"\\(){}[\]^~*?!+/]/g, " ").replace(/\s+/g, " ").trim();
  return [...plain].length < 3 ? `"${plain}"` : plain;
}

export async function searchOpenLibrary(query: string, signal?: AbortSignal): Promise<BookRecord[]> {
  const url = new URL(`${base()}/search.json`);
  url.searchParams.set("q", toQuery(query));
  url.searchParams.set("limit", "12");
  url.searchParams.set("fields", FIELDS);
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.any([AbortSignal.timeout(7000), ...(signal ? [signal] : [])]), next: { revalidate: 86_400 } });
  if (!res.ok) throw new Error(`Open Library responded ${res.status}`);
  const body = (await res.json()) as { docs?: OpenLibraryDoc[] };
  return (body.docs ?? []).flatMap((d) => fromOpenLibrary(d, query) ?? []);
}

/** Description, format and page count are not in search results. Best effort: never blocks adding a book. */
export async function enrichFromOpenLibrary(record: BookRecord): Promise<BookRecord> {
  if (!record.open_library_work_id) return record;
  const get = async (path: string) => {
    try {
      const res = await fetch(`${base()}${path}`, { headers: headers(), signal: AbortSignal.timeout(4000), next: { revalidate: 604_800 } });
      return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const [work, edition] = await Promise.all([
    get(`/works/${record.open_library_work_id}.json`),
    record.open_library_edition_id ? get(`/books/${record.open_library_edition_id}.json`) : null,
  ]);
  const description = work?.description as string | { value?: string } | undefined;
  const pages = edition?.number_of_pages;
  return {
    ...record,
    description: record.description ?? plainText(typeof description === "string" ? description : description?.value),
    format: record.format ?? inferFormat(Array.isArray(work?.subjects) ? work.subjects.map(String) : []),
    page_count: record.page_count ?? (typeof pages === "number" && Number.isInteger(pages) && pages > 0 && pages <= 50_000 ? pages : null),
  };
}
