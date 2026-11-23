import { afterEach, describe, expect, it, vi } from "vitest";
import { steps, nextStep, type GuideInput } from "@/lib/guide";
import { glossary, helpFor } from "@/lib/help";
import { hintFor } from "@/lib/hints";
import { cannotPlay, cannotPlayNote, describeKind, KINDS, lengthOf, words } from "@/lib/kinds";
import { plain } from "@/lib/plain";
import { describeEvent } from "@/lib/events";
import { fromAnilist } from "@/lib/media/anilist";
import { platformFamilies, languageFromName } from "@/lib/media/common";
import { fromIgdb, fromRawg } from "@/lib/media/games";
import { fromTmdb } from "@/lib/media/tmdb";
import { fromTvmaze } from "@/lib/media/tvmaze";
import { providersFor, searchProviders } from "@/lib/books/search";
import { storeWays, waysToGet } from "@/lib/books/where";
import { sourcePage } from "@/lib/books/types";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("words for each kind of club", () => {
  it("keeps book wording exactly as it was", () => {
    const w = words("book");
    expect([w.ours, w.mine, w.pastShelf, w.want, w.now, w.done, w.a]).toEqual(["Our book", "My books", "Books we have read", "Want to read", "Reading now", "Read", "a book"]);
    expect(steps("book").map((s) => s.name)).toEqual(["Nominate", "Vote", "Read", "Meet"]);
    expect(hintFor("Nominate a book")?.text).toBe("Put forward one book for the club to vote on.");
    expect(helpFor("/app/current-book").title).toBe("Our book");
  });

  it("gets articles and verbs right for the others", () => {
    expect(KINDS.map(describeKind)).toEqual(["A book club", "A film club", "A TV club", "An anime club", "A game club"]);
    expect(words("anime").a).toBe("an anime");
    expect(words("game").verbs).toBe("plays");
    expect(words("film").verbed).toBe("watched");
    expect(steps("game").map((s) => s.name)).toEqual(["Nominate", "Vote", "Play", "Meet"]);
    expect(steps("film")[2]!.what).toBe("The club watches the winning film.");
  });

  it("has a hint for every kind's own labels, and none speak of books", () => {
    for (const k of KINDS.filter((k) => k !== "book")) {
      const w = words(k);
      for (const label of [`Nominate ${w.a}`, `Add to ${w.mine.toLowerCase()}`, w.ours, w.mine, `Finish this ${w.one}`, `Stop ${w.verbing} this ${w.one}`, `Enter the ${w.one} by hand`, `Choose a different ${w.one}`]) {
        const hint = hintFor(label, k);
        expect(hint, `${k}: ${label}`).not.toBeNull();
        expect(hint!.text, `${k}: ${label}`).not.toMatch(/\bbooks?\b/);
      }
      expect(helpFor("/app/selection", k).about).not.toMatch(/\bbooks?\b/);
      expect(glossary(w).map(([, m]) => m).join(" ")).not.toMatch(/\bbooks?\b|club reads/);
    }
  });

  it("never mentions books in a film club's guidance, whatever the stage", () => {
    const base: GuideInput = { kind: "film", status: null, isAdmin: true, members: 3, everRead: false, nominations: 0, iNominated: false, votes: 0, iVoted: false, deadline: null, myProgress: null, meeting: null, met: false, iReviewed: false };
    const stages: Partial<GuideInput>[] = [{}, { members: 1 }, { isAdmin: false }, { status: "nominating" }, { status: "nominations_closed", nominations: 1 }, { status: "voting" }, { status: "awaiting_decision" }, { status: "reading" }, { status: "reading", met: true }, { status: "reading", myProgress: "finished", isAdmin: false, meeting: { id: "m", title: "Talk", answered: true, startsAt: new Date().toISOString() } }];
    for (const s of stages) {
      const step = nextStep({ ...base, ...s });
      expect(`${step.title} ${step.body} ${step.action?.label ?? ""}`).not.toMatch(/\bbooks?\b|\bread\b/i);
    }
    expect(describeEvent({ type: "cycle_cancelled", reference_id: null, actor: "Ada", kind: "game" }).text).toBe("Ada stopped choosing a game");
  });

  it("puts database messages in the club's words", () => {
    expect(plain("That book has already been nominated for this cycle.")).toBe("Someone has already nominated that book. Try another.");
    expect(plain("That book has already been nominated for this cycle.", "anime")).toBe("Someone has already nominated that anime. Try another.");
    expect(plain("Voting is not open, so your ballot was not saved.", "film")).toBe("Voting has closed, so your vote was not saved.");
  });

  it("says how long something is in its own terms", () => {
    const none = { page_count: null, episodes: null, runtime_minutes: null, play_hours: null };
    expect(lengthOf({ ...none, kind: "film", runtime_minutes: 112 })).toBe("1 h 52 min");
    expect(lengthOf({ ...none, kind: "anime", episodes: 1 })).toBe("1 episode");
    expect(lengthOf({ ...none, kind: "game", play_hours: 30 })).toBe("About 30 hours to finish");
    expect(lengthOf({ ...none, kind: "series" })).toBeNull();
  });

  it("counts members with nothing to play a game on, ignoring those who have not said", () => {
    expect(cannotPlay(["playstation", "pc"], [["switch"], ["pc"], [], ["xbox"]])).toBe(2);
    expect(cannotPlay([], [["switch"]])).toBe(0);
    expect(cannotPlayNote(1)).toBe("1 member has nothing to play this on");
    expect(cannotPlayNote(0)).toBeNull();
  });
});

describe("film, series, anime and game sources", () => {
  it("reads TMDB, keeping only trusted posters and skipping adult titles", () => {
    const r = fromTmdb({ id: 603, title: "The Matrix", original_title: "The Matrix", release_date: "1999-03-31", poster_path: "/p.jpg", overview: "Neo.", original_language: "en" })!;
    expect(r).toMatchObject({ kind: "film", metadata_source: "tmdb", external_id: "603", publication_year: 1999, cover_url: "https://image.tmdb.org/t/p/w342/p.jpg", original_title: null, language: "en" });
    expect(fromTmdb({ id: 1, title: "X", adult: true })).toBeNull();
  });

  it("reads TVmaze, AniList, IGDB and RAWG", () => {
    expect(fromTvmaze({ id: 82, name: "Game of Thrones", premiered: "2011-04-17", language: "English", summary: "<p>Seven <b>noble</b> families.</p>", image: { medium: "https://static.tvmaze.com/a.jpg" }, network: { name: "HBO" } }))
      .toMatchObject({ kind: "series", external_id: "82", publication_year: 2011, language: "en", description: "Seven noble families.", publisher: "HBO", cover_url: "https://static.tvmaze.com/a.jpg" });
    expect(fromAnilist({ id: 16498, title: { romaji: "Shingeki no Kyojin", english: "Attack on Titan", native: "進撃の巨人" }, synonyms: ["AoT"], episodes: 25, startDate: { year: 2013 }, coverImage: { large: "https://s4.anilist.co/c.jpg" }, studios: { nodes: [{ name: "Wit Studio" }] } }))
      .toMatchObject({ kind: "anime", title: "Attack on Titan", original_title: "進撃の巨人", alternative_titles: ["Shingeki no Kyojin", "AoT"], episodes: 25, authors: ["Wit Studio"], cover_url: "https://s4.anilist.co/c.jpg" });
    expect(fromAnilist({ id: 1, title: { romaji: "X" }, isAdult: true })).toBeNull();
    expect(fromIgdb({ id: 1942, name: "The Witcher 3", first_release_date: 1431993600, cover: { image_id: "co1wyy" }, platforms: [{ name: "PC (Microsoft Windows)" }, { name: "PlayStation 4" }, { name: "Nintendo Switch" }], involved_companies: [{ developer: true, company: { name: "CD Projekt RED" } }, { developer: false, company: { name: "Bandai" } }] }))
      .toMatchObject({ kind: "game", publication_year: 2015, platforms: ["pc", "playstation", "switch"], authors: ["CD Projekt RED"], cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg" });
    expect(fromRawg({ id: 3328, name: "The Witcher 3", released: "2015-05-18", background_image: "https://media.rawg.io/media/g.jpg", platforms: [{ platform: { name: "Xbox One" } }], playtime: 46 }))
      .toMatchObject({ platforms: ["xbox"], play_hours: 46, publication_year: 2015 });
    expect(platformFamilies(["macOS", "Linux", "iOS", "Android", "Xbox Series S/X", "Wii U"])).toEqual(["mac", "linux", "ios", "android", "xbox"]);
    expect(languageFromName("Japanese")).toBe("ja");
  });

  it("says a source is unavailable when its key is missing, without asking it", async () => {
    vi.stubEnv("TMDB_API_KEY", "");
    vi.stubEnv("TWITCH_CLIENT_ID", "");
    vi.stubEnv("RAWG_API_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await searchProviders("matrix", { kind: "film" })).toEqual({ results: [], unavailable: ["The Movie Database"] });
    expect(await searchProviders("zelda", { kind: "game" })).toEqual({ results: [], unavailable: ["the games database"] });
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("RAWG_API_KEY", "r");
    expect(providersFor("game").ready.map((p) => p.name)).toEqual(["RAWG"]);
    vi.stubEnv("TWITCH_CLIENT_ID", "c"); vi.stubEnv("TWITCH_CLIENT_SECRET", "s");
    expect(providersFor("game").ready.map((p) => p.name)).toEqual(["IGDB"]);
  });

  it("searches AniList with the query as a variable, never in the query text", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
    const sent: string[] = [];
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      sent.push(String(init.body));
      return Promise.resolve(new Response(JSON.stringify({ data: { Page: { media: [{ id: 5, title: { romaji: "Mushishi" } }] } } })));
    });
    const { results } = await searchProviders('x") { evil }', { kind: "anime", together: 0 });
    expect(results.map((r) => r.record.title)).toEqual(["Mushishi"]);
    const body = JSON.parse(sent[0]!);
    expect(body.variables).toEqual({ search: 'x") { evil }' });
    expect(body.query).not.toContain("evil");
  });

  it("links to the item at its source, as the sources ask", () => {
    expect(sourcePage({ metadata_source: "tmdb", external_id: "603" })).toBe("https://www.themoviedb.org/movie/603");
    expect(sourcePage({ metadata_source: "rawg", external_id: "3328" })).toBe("https://rawg.io/games/3328");
    expect(sourcePage({ metadata_source: "open_library", external_id: null })).toBeNull();
  });
});

describe("where to get it", () => {
  const base = { authors: [], isbn_13: null, isbn_10: null, open_library_work_id: null, open_library_edition_id: null, google_books_id: null };

  it("lists game stores only for the game's platforms", () => {
    expect(storeWays({ ...base, title: "Halo", kind: "game", platforms: ["xbox", "pc"] }).map((w) => w.label)).toEqual(["Look for it on Steam", "Look for it on GOG", "Look for it on Xbox Store"]);
    expect(storeWays({ ...base, title: "Odd", kind: "game", platforms: [] })).toHaveLength(6);
  });

  it("asks TMDB where a film streams in the reader's country, then offers JustWatch", async () => {
    vi.stubEnv("TMDB_API_KEY", "k");
    vi.stubGlobal("fetch", (url: URL) => {
      expect(String(url)).toContain("/3/movie/603/watch/providers");
      return Promise.resolve(new Response(JSON.stringify({ results: { RW: { link: "https://www.themoviedb.org/movie/603/watch?locale=RW", flatrate: [{ provider_name: "Netflix" }], buy: [{ provider_name: "Apple TV" }] } } })));
    });
    const ways = await waysToGet({ ...base, title: "The Matrix", kind: "film", metadata_source: "tmdb", external_id: "603" }, "RW");
    expect(ways.map((w) => w.label)).toEqual(["Stream it on Netflix", "Buy it", "Look for it on JustWatch"]);
    expect(ways.at(-1)!.href).toBe("https://www.justwatch.com/rw/search?q=The%20Matrix");
  });

  it("offers only AniList's https streaming links for anime", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ data: { Media: { externalLinks: [
      { site: "Crunchyroll", url: "https://www.crunchyroll.com/x", type: "STREAMING" },
      { site: "Twitter", url: "https://twitter.com/x", type: "SOCIAL" },
      { site: "Odd", url: "http://odd.example", type: "STREAMING" },
    ] } } }))));
    const ways = await waysToGet({ ...base, title: "Mushishi", kind: "anime", metadata_source: "anilist", external_id: "457" }, null);
    expect(ways.map((w) => w.label)).toEqual(["Watch it on Crunchyroll", "Look for it on JustWatch"]);
  });
});
