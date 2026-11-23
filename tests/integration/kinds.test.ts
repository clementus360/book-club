import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Harness } from "../support/harness";

let h: Harness;
beforeAll(async () => { h = await Harness.create("kinds"); });
afterAll(() => h.end());

const film = (title = "Stalker", extra: Record<string, unknown> = {}): Promise<string> =>
  h.rpc("service", "import_book", { p_book: { title, kind: "film", metadata_source: "tmdb", external_id: String(Math.floor(Math.random() * 1e9)), authors: ["Andrei Tarkovsky"], runtime_minutes: 161, ...extra } }) as Promise<string>;
const game = (title = "Outer Wilds", platforms: string[] = ["pc", "playstation"]) =>
  h.rpc("service", "import_book", { p_book: { title, kind: "game", metadata_source: "igdb", external_id: String(Math.floor(Math.random() * 1e9)), platforms } }) as Promise<string>;

describe("kinds of club", () => {
  it("creates a club of a chosen kind, books by default", async () => {
    const a = await h.user();
    const books = await h.club(a);
    const films = await h.rpc(a, "create_club", { p_name: "Reel", p_kind: "film" });
    expect(await h.sql("select id, kind from clubs where id = any($1) order by kind", [[books, films]])).toEqual([{ id: books, kind: "book" }, { id: films, kind: "film" }]);
  });

  it("takes only its own kind, by every way in", async () => {
    const a = await h.user();
    const club = await h.rpc(a, "create_club", { p_name: "Reel", p_kind: "film" });
    const book = await h.importBook("Solaris");
    const movie = await film();
    await expect(h.rpc(a, "add_club_book", { p_club_id: club, p_book_id: book })).rejects.toThrow(/This is a film club, so only films can be added/);
    await h.rpc(a, "add_club_book", { p_club_id: club, p_book_id: movie });
    await h.shelve(a, book);
    await expect(h.rpc(a, "recommend_book", { p_club_id: club, p_book_id: book })).rejects.toThrow(/only films/);
    const cycle = await h.cycle(a, club);
    await expect(h.rpc(a, "nominate", { p_cycle_id: cycle, p_book_id: book })).rejects.toThrow(/only films/);
    const nomination = await h.rpc(a, "nominate", { p_cycle_id: cycle, p_book_id: movie });
    await expect(h.rpc(a, "update_nomination", { p_nomination_id: nomination, p_book_id: book, p_explanation: null })).rejects.toThrow(/only films/);
    // A book club is just as strict the other way.
    const readers = await h.club(a);
    await expect(h.rpc(a, "add_club_book", { p_club_id: readers, p_book_id: movie })).rejects.toThrow(/This is a book club, so only books can be added/);
  });

  it("can change kind only while nothing belongs to it", async () => {
    const a = await h.user();
    const club = await h.club(a);
    await h.as(a, "update clubs set kind = 'anime' where id = $1", [club]);
    expect((await h.sql("select kind from clubs where id = $1", [club]))[0]!.kind).toBe("anime");
    const show = await h.rpc("service", "import_book", { p_book: { title: "Mushishi", kind: "anime", metadata_source: "anilist", external_id: "457" } });
    await h.rpc(a, "add_club_book", { p_club_id: club, p_book_id: show });
    await expect(h.as(a, "update clubs set kind = 'book' where id = $1", [club])).rejects.toThrow(/only change before anything has been added/);
    const member = await h.user();
    await h.join(a, club, member);
    expect(await h.as(member, "update clubs set kind = 'book' where id = $1 returning id", [club])).toEqual([]);
  });
});

describe("the catalogue for other kinds", () => {
  it("matches a source's record by its own identifier, filling gaps but never overwriting", async () => {
    const id = randomUUID();
    const first = await h.rpc("service", "import_book", { p_book: { title: "Mushishi", kind: "anime", metadata_source: "anilist", external_id: id } });
    const again = await h.rpc("service", "import_book", { p_book: { title: "Mushi-Shi", kind: "anime", metadata_source: "anilist", external_id: id, episodes: 26 } });
    expect(again).toBe(first);
    expect(await h.sql("select title, episodes, kind from books where id = $1", [first])).toEqual([{ title: "Mushishi", episodes: 26, kind: "anime" }]);
    // The same number from another source is another record.
    const other = await h.rpc("service", "import_book", { p_book: { title: "Mushishi", kind: "series", metadata_source: "tvmaze", external_id: id } });
    expect(other).not.toBe(first);
    await expect(h.rpc("service", "import_book", { p_book: { title: "No id", kind: "film", metadata_source: "tmdb" } })).rejects.toThrow(/no identifier/);
  });

  it("keeps platforms to known families, and only the server imports", async () => {
    const g = await h.rpc("service", "import_book", { p_book: { title: "Hades", kind: "game", metadata_source: "rawg", external_id: "1", platforms: ["pc", "switch", "amiga"] } });
    expect((await h.sql("select platforms from books where id = $1", [g]))[0]!.platforms.sort()).toEqual(["pc", "switch"]);
    const a = await h.user();
    await expect(h.rpc(a, "import_book", { p_book: { title: "Mine", kind: "game", metadata_source: "rawg", external_id: "2" } })).rejects.toThrow(/permission denied/);
    await expect(h.as(a, "update profiles set platforms = '{amiga}' where id = $1", [a])).rejects.toThrow(/check constraint/);
    await h.as(a, "update profiles set platforms = '{xbox,pc}' where id = $1", [a]);
  });

  it("enters other kinds by hand, and finds look-alikes only within a kind", async () => {
    const a = await h.user();
    const mine = await h.rpc(a, "create_manual_book", { p_book: { title: "Home Movie", kind: "film", authors: ["Me"], runtime_minutes: 42, publication_year: 2020 } });
    expect(await h.sql("select kind, runtime_minutes, metadata_source from books where id = $1", [mine])).toEqual([{ kind: "film", runtime_minutes: 42, metadata_source: "manual" }]);
    await expect(h.rpc(a, "create_manual_book", { p_book: { title: " ", kind: "film" } })).rejects.toThrow(/Please give it a title/);
    await h.manualBook(a, "Home Movie", { authors: ["Me"] });
    const similar = (p: object) => h.as(a, "select id from find_similar_books($1::jsonb)", [JSON.stringify(p)]);
    expect(await similar({ title: "Home Movie", kind: "film", authors: ["Me"] })).toEqual([{ id: mine }]);
    // A different year is a different film (a remake), even with the same title and director.
    expect(await similar({ title: "Home Movie", kind: "film", authors: ["Me"], publication_year: 1990 })).toEqual([]);
    await h.rpc(a, "update_manual_book", { p_book_id: mine, p_book: { title: "Home Movie II", kind: "book", runtime_minutes: 50 } });
    expect(await h.sql("select title, kind, runtime_minutes from books where id = $1", [mine])).toEqual([{ title: "Home Movie II", kind: "film", runtime_minutes: 50 }]);
  });
});

describe("progress, goals and emails", () => {
  it("records episodes and hours, and lets an administrator set a goal", async () => {
    const v = await h.votingClub(2, 2);
    const [admin, member] = v.people as [string, string];
    await h.rpc(admin, "submit_ballot", { p_cycle_id: v.cycle, p_ranking: v.nominations });
    await h.rpc(admin, "close_voting_now", { p_cycle_id: v.cycle });
    await h.as(member, "insert into reading_progress (cycle_id, user_id, status, episode, hours) values ($1, $2, 'reading', 7, 12)", [v.cycle, member]);
    expect(await h.as(admin, "select episode, hours from reading_progress")).toEqual([{ episode: 7, hours: 12 }]);
    await expect(h.rpc(member, "set_cycle_goal", { p_cycle_id: v.cycle, p_goal: "Up to episode 6" })).rejects.toThrow();
    await h.rpc(admin, "set_cycle_goal", { p_cycle_id: v.cycle, p_goal: "  Up to episode 6  " });
    expect((await h.cycleRow(v.cycle)).goal).toBe("Up to episode 6");
    await h.rpc(admin, "set_cycle_goal", { p_cycle_id: v.cycle, p_goal: "" });
    expect((await h.cycleRow(v.cycle)).goal).toBeNull();
  });

  it("tells email and invitations what kind of club it is", async () => {
    const a = await h.user();
    const club = await h.rpc(a, "create_club", { p_name: "Players", p_kind: "game" });
    const { token } = await h.rpc(a, "create_invitation", { p_club_id: club });
    const someone = await h.user();
    expect(await h.rpc(someone, "preview_invitation", { p_token: token })).toMatchObject({ status: "pending", club_name: "Players", club_kind: "game" });
    await h.cycle(a, club);
    const claimed = await h.rpc("service", "claim_emails", { p_limit: 50 });
    expect(claimed.filter((e: { club_id: string }) => e.club_id === club).every((e: { kind: string }) => e.kind === "game")).toBe(true);
  });

  it("knows which games members could play", async () => {
    const g = await game("Halo", ["xbox"]);
    expect((await h.sql("select platforms from books where id = $1", [g]))[0]!.platforms).toEqual(["xbox"]);
  });
});
