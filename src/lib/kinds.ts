import type { Enums } from "./database.types";

/** What a club is about. Everything a person reads on screen follows from it. */
export type Kind = Enums<"club_kind">;
export const KINDS: readonly Kind[] = ["book", "film", "series", "anime", "game"];
export const isKind = (v: unknown): v is Kind => typeof v === "string" && (KINDS as readonly string[]).includes(v);

/**
 * The words for one kind of club. Sentences are written out with these slots
 * rather than by swapping "book" for another word, so articles and verbs stay
 * right ("an anime", "watched"). Book wording is exactly what it always was.
 */
export type Words = {
  kind: Kind;
  /** For choosing a kind: "Books", "Films". */
  label: string;
  club: string;           // book club
  one: string;            // book
  many: string;           // books
  a: string;              // a book / an anime
  verb: string;           // read / watch / play
  verbs: string;          // reads / watches / plays
  verbing: string;        // reading
  verbed: string;         // read / watched / played
  ours: string;           // Our book
  mine: string;           // My books
  pastShelf: string;      // Books we have read
  want: string;           // Want to read
  now: string;            // Reading now
  done: string;           // Read
  progressing: string;    // Reading (progress status)
  creator: string;        // Author
  source: string;         // where search looks, in a phrase
  getThis: string;        // Get this book
  /** What progress is counted in, if anything beyond started and finished. */
  unit: "page" | "episode" | "hours" | null;
};

const BOOK: Words = {
  kind: "book", label: "Books", club: "book club", one: "book", many: "books", a: "a book",
  verb: "read", verbs: "reads", verbing: "reading", verbed: "read", ours: "Our book", mine: "My books", pastShelf: "Books we have read",
  want: "Want to read", now: "Reading now", done: "Read", progressing: "Reading", creator: "Author",
  source: "two large book catalogues", getThis: "Get this book", unit: "page",
};
const FILM: Words = {
  kind: "film", label: "Films", club: "film club", one: "film", many: "films", a: "a film",
  verb: "watch", verbs: "watches", verbing: "watching", verbed: "watched", ours: "Our film", mine: "My films", pastShelf: "Films we have watched",
  want: "Want to watch", now: "Watching now", done: "Watched", progressing: "Watching", creator: "Director",
  source: "The Movie Database", getThis: "Watch this film", unit: null,
};
const SERIES: Words = {
  kind: "series", label: "TV series", club: "TV club", one: "series", many: "series", a: "a series",
  verb: "watch", verbs: "watches", verbing: "watching", verbed: "watched", ours: "Our series", mine: "My series", pastShelf: "Series we have watched",
  want: "Want to watch", now: "Watching now", done: "Watched", progressing: "Watching", creator: "Created by",
  source: "TVmaze", getThis: "Watch this series", unit: "episode",
};
const ANIME: Words = {
  kind: "anime", label: "Anime", club: "anime club", one: "anime", many: "anime", a: "an anime",
  verb: "watch", verbs: "watches", verbing: "watching", verbed: "watched", ours: "Our anime", mine: "My anime", pastShelf: "Anime we have watched",
  want: "Want to watch", now: "Watching now", done: "Watched", progressing: "Watching", creator: "Studio",
  source: "AniList", getThis: "Watch this anime", unit: "episode",
};
const GAME: Words = {
  kind: "game", label: "Games", club: "game club", one: "game", many: "games", a: "a game",
  verb: "play", verbs: "plays", verbing: "playing", verbed: "played", ours: "Our game", mine: "My games", pastShelf: "Games we have played",
  want: "Want to play", now: "Playing now", done: "Played", progressing: "Playing", creator: "Developer",
  source: "the Internet Game Database", getThis: "Get this game", unit: "hours",
};

const ALL: Record<Kind, Words> = { book: BOOK, film: FILM, series: SERIES, anime: ANIME, game: GAME };

export const words = (kind: Kind | null | undefined): Words => ALL[kind ?? "book"] ?? BOOK;
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A club's kind in a short description: "A film club". */
export const describeKind = (kind: Kind) => `${/^[aeiou]/.test(words(kind).club) ? "An" : "A"} ${words(kind).club}`;

/** Game platforms, by the family a member owns. */
export const PLATFORMS = ["pc", "mac", "linux", "playstation", "xbox", "switch", "ios", "android"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_LABEL: Record<Platform, string> = {
  pc: "PC", mac: "Mac", linux: "Linux", playstation: "PlayStation", xbox: "Xbox", switch: "Nintendo Switch", ios: "iPhone and iPad", android: "Android",
};
export const isPlatform = (v: unknown): v is Platform => typeof v === "string" && (PLATFORMS as readonly string[]).includes(v);

/** How long something is, in its own terms. */
export function lengthOf(b: { kind: Kind; page_count: number | null; episodes: number | null; runtime_minutes: number | null; play_hours: number | null }): string | null {
  switch (b.kind) {
    case "book": return b.page_count ? `${b.page_count} pages` : null;
    case "film": return b.runtime_minutes ? hoursAndMinutes(b.runtime_minutes) : null;
    case "series":
    case "anime": return b.episodes ? `${b.episodes} episode${b.episodes === 1 ? "" : "s"}` : null;
    case "game": return b.play_hours ? `About ${b.play_hours} hour${b.play_hours === 1 ? "" : "s"} to finish` : null;
  }
}

export function hoursAndMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

/**
 * For game clubs: how many members could not play a game on anything they own.
 * Members who have not said what they own are not counted either way.
 */
export function cannotPlay(gamePlatforms: string[], memberPlatforms: string[][]): number {
  if (!gamePlatforms.length) return 0;
  return memberPlatforms.filter((own) => own.length > 0 && !own.some((p) => gamePlatforms.includes(p))).length;
}

export const cannotPlayNote = (n: number) => (n ? `${n} ${n === 1 ? "member has" : "members have"} nothing to play this on` : null);

/** "page 120, 35%", "episode 7", "12 hours" */
export function progressDetail(p: { status: string; current_page: number | null; percentage: number | null; episode: number | null; hours: number | null }): string {
  if (p.status !== "reading") return "";
  return [
    p.current_page !== null && `page ${p.current_page}`,
    p.episode !== null && `episode ${p.episode}`,
    p.hours !== null && `${p.hours} hour${p.hours === 1 ? "" : "s"}`,
    p.percentage !== null && `${p.percentage}%`,
  ].filter(Boolean).join(", ");
}
