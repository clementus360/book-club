import "server-only";

import type { Kind } from "@/lib/kinds";
import { anilistStreams } from "@/lib/media/anilist";
import { tmdbWatch } from "@/lib/media/tmdb";
import { tvmazeHome } from "@/lib/media/tvmaze";

/** Ways to get hold of something: read free, borrow, stream, find in a library, or buy. */
export type Way = { kind: "free" | "borrow" | "stream" | "library" | "buy"; label: string; note: string; href: string };

type Book = {
  title: string; authors: string[]; isbn_13: string | null; isbn_10: string | null;
  open_library_work_id: string | null; open_library_edition_id: string | null; google_books_id: string | null;
  kind?: Kind; metadata_source?: string; external_id?: string | null; platforms?: string[]; language?: string | null; publication_year?: number | null;
};

const gb = () => process.env.GOOGLE_BOOKS_URL ?? "https://www.googleapis.com";
const DAY = 86_400;

/** JSON, or null. A failure only means a line is left out, but it is logged so it can be noticed. */
async function get(url: URL, timeout = 4000): Promise<unknown> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Commonplace/1.0 (private book clubs)" }, signal: AbortSignal.timeout(timeout), next: { revalidate: DAY } });
    if (!res.ok) console.warn(`[commonplace] ${url.hostname} responded ${res.status}`);
    return res.ok ? await res.json() : null;
  } catch (error) {
    console.warn(`[commonplace] ${url.hostname}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

const OL_ID = /^OL\d+[MW]$/;

const ia = () => process.env.INTERNET_ARCHIVE_URL ?? "https://archive.org";

type Item = { identifier?: string; openlibrary_edition?: string[] | string; language?: string[] | string; lending___status?: string[] | string; "access-restricted-item"?: string | boolean };
const list = (v: string[] | string | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

/** True if an Internet Archive language value names the book's language ("eng", "English", "en"). */
function sameLanguage(values: string[], code: string | null): boolean {
  if (!code) return false;
  let name = "";
  try { name = new Intl.DisplayNames(["en"], { type: "language" }).of(code)?.toLowerCase() ?? ""; } catch { /* unknown code */ }
  return values.some((v) => { const l = v.toLowerCase(); return l === code || l === name || (name.length >= 3 && l === name.slice(0, 3)); });
}

/**
 * Whether the Internet Archive, which does Open Library's lending, has a copy
 * anyone can borrow or read. Asked of the Archive's own search, which answers in
 * a second or two; Open Library's search can take most of a minute.
 */
export async function openLibraryWays(book: Book): Promise<Way[]> {
  const isbn = book.isbn_13 ?? book.isbn_10;
  const work = book.open_library_work_id && OL_ID.test(book.open_library_work_id) ? book.open_library_work_id : null;
  if (!work && !isbn) return [];
  const url = new URL(`${ia()}/advancedsearch.php`);
  url.searchParams.set("q", work ? `openlibrary_work:${work}` : `isbn:${isbn}`);
  for (const f of ["identifier", "openlibrary_edition", "language", "lending___status", "access-restricted-item"]) url.searchParams.append("fl[]", f);
  url.searchParams.set("rows", "50");
  url.searchParams.set("output", "json");
  const docs = ((await get(url, 6000)) as { response?: { docs?: Item[] } } | null)?.response?.docs ?? [];

  // The Archive says of each copy whether it can be borrowed now, borrowed after a wait, or only read by print-disabled people.
  const status = (d: Item) => list(d.lending___status);
  const now = docs.filter((d) => status(d).includes("is_borrowable"));
  const later = docs.filter((d) => status(d).includes("is_lendable") && !status(d).includes("is_borrowable"));
  // Open copies count as free only for books old enough to be out of copyright: anyone can upload a recent one.
  const old = book.publication_year != null && book.publication_year < 1930;
  const open = old ? docs.filter((d) => status(d).includes("is_readable") && String(d["access-restricted-item"]) !== "true") : [];
  // The edition people chose, then one in its language, then any.
  const best = (items: Item[]) =>
    items.find((d) => book.open_library_edition_id && list(d.openlibrary_edition).includes(book.open_library_edition_id))
    ?? items.find((d) => sameLanguage(list(d.language), book.language ?? null)) ?? items[0];
  const pageFor = (d: Item) => {
    const edition = list(d.openlibrary_edition).find((e) => OL_ID.test(e));
    if (edition) return `https://openlibrary.org/books/${edition}`;
    return d.identifier && /^[\w.-]+$/.test(d.identifier) ? `https://archive.org/details/${d.identifier}` : null;
  };
  const free = open.length ? pageFor(best(open)!) : null;
  if (free) return [{ kind: "free", label: "Read it free", note: "Open Library, out of copyright", href: free }];
  const ready = now.length ? pageFor(best(now)!) : null;
  if (ready) return [{ kind: "borrow", label: "Borrow the e-book", note: "Open Library, free account needed", href: ready }];
  const queue = later.length ? pageFor(best(later)!) : null;
  if (queue) return [{ kind: "borrow", label: "Borrow the e-book", note: "Open Library, free account needed. There may be a wait", href: queue }];
  return [];
}

type Volume = {
  saleInfo?: { country?: string; saleability?: string; buyLink?: string; retailPrice?: { amount?: number; currencyCode?: string } };
  accessInfo?: { viewability?: string; publicDomain?: boolean; webReaderLink?: string };
};

const safe = (href: string | undefined) => {
  try {
    const u = new URL(href ?? "");
    return u.protocol === "https:" && /(^|\.)google\.com$/.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
};

function price(p: Volume["saleInfo"]): string | null {
  const amount = p?.retailPrice?.amount;
  const currency = p?.retailPrice?.currencyCode;
  if (typeof amount !== "number" || !currency || !/^[A-Z]{3}$/.test(currency)) return null;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
  } catch {
    return null;
  }
}

/** Google Books knows about e-books for sale, or free, in the reader's country. */
export function googleWaysFrom(volume: Volume | null | undefined): Way[] {
  if (!volume) return [];
  const ways: Way[] = [];
  const sale = volume.saleInfo;
  const reader = safe(volume.accessInfo?.webReaderLink);
  const buy = safe(sale?.buyLink);
  if (sale?.saleability === "FREE" && (buy || reader)) ways.push({ kind: "free", label: "Read it free", note: "Google Play Books", href: (buy ?? reader)! });
  else if (volume.accessInfo?.publicDomain && volume.accessInfo.viewability === "ALL_PAGES" && reader) ways.push({ kind: "free", label: "Read it free", note: "Google Books, out of copyright", href: reader });
  if (sale?.saleability === "FOR_SALE" && buy) ways.push({ kind: "buy", label: "Buy the e-book", note: ["Google Play Books", price(sale)].filter(Boolean).join(", "), href: buy });
  return ways;
}

export async function googleWays(book: Book, country: string | null): Promise<Way[]> {
  const isbn = book.isbn_13 ?? book.isbn_10;
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  const id = book.google_books_id && /^[\w-]{4,40}$/.test(book.google_books_id) ? book.google_books_id : null;
  if (!id && !isbn) return [];
  const url = new URL(id ? `${gb()}/books/v1/volumes/${id}` : `${gb()}/books/v1/volumes`);
  if (!id) url.searchParams.set("q", `isbn:${isbn}`);
  if (country) url.searchParams.set("country", country);
  url.searchParams.set("fields", id ? "saleInfo,accessInfo" : "items(saleInfo,accessInfo)");
  if (key) url.searchParams.set("key", key);
  const body = (await get(url)) as (Volume & { items?: Volume[] }) | null;
  return googleWaysFrom(id ? body : body?.items?.[0]);
}

/** Search links that always work, built from the ISBN or else the title and author. */
export function searchWays(book: Book): Way[] {
  const isbn = book.isbn_13 ?? book.isbn_10;
  const words = [book.title, book.authors[0]].filter(Boolean).join(" ");
  const q = encodeURIComponent(isbn ?? words);
  return [
    { kind: "library", label: "Find it in a library", note: "WorldCat, libraries near you", href: `https://search.worldcat.org/search?q=${isbn ? `bn%3A${isbn}` : q}` },
    { kind: "buy", label: "Look for it on Amazon", note: "New and second-hand", href: `https://www.amazon.com/s?k=${q}&i=stripbooks` },
    { kind: "buy", label: "Look for it on AbeBooks", note: "Second-hand, ships worldwide", href: isbn ? `https://www.abebooks.com/servlet/SearchResults?isbn=${isbn}` : `https://www.abebooks.com/servlet/SearchResults?kn=${q}` },
  ];
}

const ORDER = { free: 0, borrow: 1, stream: 2, library: 3, buy: 4 } as const;

/** Search links for things to watch, in the reader's country. JustWatch covers most services. */
function justWatch(book: Book, country: string | null): Way {
  return { kind: "stream", label: "Look for it on JustWatch", note: "Every streaming service, in your country", href: `https://www.justwatch.com/${(country ?? "us").toLowerCase()}/search?q=${encodeURIComponent(book.title)}` };
}

/** Store searches, only for platforms the game is on (or all of them if that is not known). */
export function storeWays(book: Book): Way[] {
  const q = encodeURIComponent(book.title);
  const on = (p: string[]) => !book.platforms?.length || p.some((x) => book.platforms!.includes(x));
  const stores: [string[], string, string][] = [
    [["pc", "mac", "linux"], "Steam", `https://store.steampowered.com/search/?term=${q}`],
    [["pc", "mac", "linux"], "GOG", `https://www.gog.com/en/games?query=${q}`],
    [["playstation"], "PlayStation Store", `https://store.playstation.com/en-us/search/${q}`],
    [["xbox"], "Xbox Store", `https://www.xbox.com/en-US/search/results/games?q=${q}`],
    [["switch"], "Nintendo eShop", `https://www.nintendo.com/us/search/#q=${q}&cat=gme`],
    [["android"], "Google Play", `https://play.google.com/store/search?q=${q}&c=apps`],
  ];
  return stores.filter(([p]) => on(p)).map(([, name, href]) => ({ kind: "buy", label: `Look for it on ${name}`, note: name === "GOG" ? "No copy protection" : "Search the store", href }));
}

/** Films: what TMDB (from JustWatch) knows for this country, then a JustWatch search. */
async function filmWays(book: Book, country: string | null): Promise<Way[]> {
  const watch = book.metadata_source === "tmdb" && book.external_id && country ? await tmdbWatch(book.external_id, country) : null;
  const ways: Way[] = [];
  if (watch?.stream.length) ways.push({ kind: "stream", label: `Stream it on ${watch.stream.slice(0, 3).join(", ")}`, note: "Where to watch, from JustWatch", href: watch.link });
  if (watch?.rent.length) ways.push({ kind: "buy", label: "Rent it", note: watch.rent.slice(0, 3).join(", "), href: watch.link });
  if (watch?.buy.length) ways.push({ kind: "buy", label: "Buy it", note: watch.buy.slice(0, 3).join(", "), href: watch.link });
  return [...ways, justWatch(book, country)];
}

async function seriesWays(book: Book, country: string | null): Promise<Way[]> {
  const home = book.metadata_source === "tvmaze" && book.external_id ? await tvmazeHome(book.external_id) : null;
  const ways: Way[] = [];
  if (home?.channel && home.site) ways.push({ kind: "stream", label: `Watch it on ${home.channel}`, note: "Its official page", href: home.site });
  return [...ways, justWatch(book, country)];
}

async function animeWays(book: Book, country: string | null): Promise<Way[]> {
  const streams = book.metadata_source === "anilist" && book.external_id ? await anilistStreams(book.external_id) : [];
  return [
    ...streams.map((s): Way => ({ kind: "stream", label: `Watch it on ${s.site}`, note: "Listed by AniList; may depend on your country", href: s.url })),
    justWatch(book, country),
  ];
}

/** Every way, best first: one free reading at most, and live results before plain searches. */
export async function waysToGet(book: Book, country: string | null): Promise<Way[]> {
  switch (book.kind ?? "book") {
    case "film": return filmWays(book, country);
    case "series": return seriesWays(book, country);
    case "anime": return animeWays(book, country);
    case "game": return storeWays(book);
    default: break;
  }
  const [open, google] = await Promise.all([openLibraryWays(book), googleWays(book, country)]);
  const live = [...open, ...google];
  const ways = [...live.filter((w, i) => w.kind !== "free" || live.findIndex((x) => x.kind === "free") === i), ...searchWays(book)];
  return ways.map((w, i) => ({ w, i })).sort((a, b) => ORDER[a.w.kind] - ORDER[b.w.kind] || a.i - b.i).map(({ w }) => w);
}
