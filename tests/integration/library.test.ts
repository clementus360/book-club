import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Harness } from "../support/harness";

let h: Harness;
beforeAll(async () => { h = await Harness.create("library"); });
afterAll(() => h.end());

describe("personal library", () => {
  it("adds, updates, reviews and deletes", async () => {
    const a = await h.user();
    const book = await h.importBook("Solaris");
    await h.shelve(a, book, "want_to_read");
    await h.as(a, "update user_books set status = 'read', date_started = '2026-01-01', date_finished = '2026-01-09' where book_id = $1", [book]);
    await h.as(a, "insert into personal_reviews (user_id, book_id, rating, review_text) values ($1, $2, 5, 'first')", [a, book]);
    await h.as(a, "update personal_reviews set review_text = 'second' where book_id = $1", [book]);
    expect(await h.as(a, "select status, review_text from user_books join personal_reviews using (user_id, book_id)")).toEqual([{ status: "read", review_text: "second" }]);
    await h.as(a, "delete from user_books where book_id = $1", [book]);
    expect(await h.sql("select 1 from personal_reviews where user_id = $1", [a])).toEqual([]);
    expect(await h.sql("select 1 from books where id = $1", [book])).toHaveLength(1);
  });
  it("refuses duplicates and impossible dates", async () => {
    const a = await h.user();
    const book = await h.importBook("Kindred");
    await h.shelve(a, book);
    await expect(h.shelve(a, book)).rejects.toThrow(/duplicate key/);
    await expect(h.as(a, "update user_books set date_started = '2026-02-01', date_finished = '2026-01-01' where book_id = $1", [book])).rejects.toThrow(/check constraint/);
  });
  it("is invisible and untouchable to everyone else, clubmates and administrators included", async () => {
    const [admin, b] = [await h.user(), await h.user()];
    const club = await h.club(admin);
    await h.join(admin, club, b);
    const book = await h.importBook("Beloved");
    await h.shelve(b, book);
    await h.as(b, "update user_books set private_notes = 'secret' where book_id = $1", [book]);
    await h.as(b, "insert into personal_reviews (user_id, book_id, rating, review_text) values ($1, $2, 2, 'private')", [b, book]);
    await h.rpc(b, "add_club_book", { p_club_id: club, p_book_id: book });
    for (const table of ["user_books", "personal_reviews"]) {
      expect(await h.as(admin, `select * from ${table}`)).toEqual([]);
      expect(await h.as(admin, `delete from ${table} where user_id = $1 returning id`, [b])).toEqual([]);
    }
    expect(await h.as(admin, "update personal_reviews set review_text = 'x' where user_id = $1 returning id", [b])).toEqual([]);
    await expect(h.as(admin, "insert into user_books (user_id, book_id) values ($1, $2)", [b, book])).rejects.toThrow(/row-level security/);
    await expect(h.as(admin, "update user_books set user_id = $1", [admin])).rejects.toThrow(/permission denied/);
  });
  it("outlives club membership", async () => {
    const [admin, b] = [await h.user(), await h.user()];
    const club = await h.club(admin);
    await h.join(admin, club, b);
    const book = await h.importBook("Ficciones");
    await h.shelve(b, book);
    await h.as(b, "insert into personal_reviews (user_id, book_id, rating) values ($1, $2, 4)", [b, book]);
    await h.rpc(admin, "remove_member", { p_club_id: club, p_user_id: b });
    expect(await h.as(b, "select rating from personal_reviews")).toEqual([{ rating: 4 }]);
  });
  it("survives a club book being shared by several clubs without duplicates", async () => {
    const a = await h.user();
    const [c1, c2] = [await h.club(a, "One"), await h.club(a, "Two")];
    const book = await h.importBook("Shared");
    await h.shelve(a, book);
    await h.rpc(a, "add_club_book", { p_club_id: c1, p_book_id: book });
    await h.rpc(a, "add_club_book", { p_club_id: c2, p_book_id: book });
    await expect(h.rpc(a, "add_club_book", { p_club_id: c1, p_book_id: book })).rejects.toThrow(/already in the club library/);
    await h.as(a, "delete from user_books where book_id = $1", [book]);
    expect(await h.as(a, "select 1 from club_books where book_id = $1", [book])).toHaveLength(2);
  });
});

describe("catalogue", () => {
  it("accepts provider imports from the server only", async () => {
    const a = await h.user();
    await expect(h.rpc(a, "import_book", { p_book: { title: "Forged", metadata_source: "open_library" } })).rejects.toThrow(/permission denied/);
    await expect(h.as(a, "insert into books (title, metadata_source) values ('x', 'manual')")).rejects.toThrow(/permission denied/);
    await expect(h.as(a, "update books set title = 'x'")).rejects.toThrow(/permission denied/);
  });
  it("recognises the same record and the same ISBN across providers", async () => {
    const first = await h.importBook("Dune", { open_library_edition_id: "OL1M", isbn_13: "9780441013593" });
    expect(await h.importBook("Dune", { open_library_edition_id: "OL1M" })).toBe(first);
    const viaGoogle = await h.rpc("service", "import_book", {
      p_book: { title: "Dune", authors: ["Frank Herbert"], metadata_source: "google_books", google_books_id: "gDune", isbn_13: "9780441013593", page_count: 600 },
    });
    expect(viaGoogle).toBe(first);
    expect((await h.sql("select google_books_id, page_count, title from books where id = $1", [first]))[0]).toEqual({ google_books_id: "gDune", page_count: 600, title: "Dune" });
  });
  it("never merges different volumes or editions", async () => {
    const v1 = await h.importBook("Monster", { volume_number: "1", open_library_work_id: "OLW1", open_library_edition_id: null, isbn_13: "9781591166412" });
    const v2 = await h.importBook("Monster", { volume_number: "2", open_library_work_id: "OLW1", open_library_edition_id: null, isbn_13: "9781591166412" });
    expect(v2).not.toBe(v1);
    const en = await h.importBook("Kafka on the Shore", { open_library_work_id: "OLW2", open_library_edition_id: "OLE-en", language: "en" });
    const ja = await h.importBook("海辺のカフカ", { open_library_work_id: "OLW2", open_library_edition_id: "OLE-ja", language: "ja" });
    expect(ja).not.toBe(en);
    const a = await h.user();
    const similar = await h.as(a, "select id from find_similar_books($1)", [JSON.stringify({ title: "Monster", authors: ["An Author"], volume_number: "2" })]);
    expect(similar.map((s) => s.id)).toEqual([v2]);
  });
  it("offers uncertain matches rather than merging", async () => {
    const a = await h.user();
    const id = await h.importBook("The Trial", { authors: ["Franz Kafka"] });
    const other = await h.importBook("The Trial", { authors: ["Franz Kafka"] });
    expect(other).not.toBe(id);
    const rows = await h.as(a, "select id from find_similar_books($1)", [JSON.stringify({ title: "the  trial", authors: ["franz kafka"] })]);
    expect(rows.map((r) => r.id).sort()).toEqual([id, other].sort());
  });
  it("is safe against two people importing the same record at once", async () => {
    const ids = await Promise.all([1, 2, 3].map(() => h.importBook("Race", { open_library_edition_id: "OLrace" })));
    expect(new Set(ids).size).toBe(1);
  });
  it("keeps a manual entry private until it is shared with a club", async () => {
    const [a, b, outsider] = [await h.user(), await h.user(), await h.user()];
    const club = await h.club(a);
    await h.join(a, club, b);
    const book = await h.manualBook(a, "A Family Memoir", { volume_number: "3", series_title: "Letters" });
    expect(await h.as(b, "select id from books where id = $1", [book])).toEqual([]);
    await expect(h.shelve(b, book)).rejects.toThrow(/row-level security/);
    await expect(h.rpc(outsider, "update_manual_book", { p_book_id: book, p_book: { title: "x" } })).rejects.toThrow(/Only the person/);
    await h.rpc(a, "add_club_book", { p_club_id: club, p_book_id: book });
    expect(await h.as(b, "select id from books where id = $1", [book])).toHaveLength(1);
    expect(await h.as(outsider, "select id from books where id = $1", [book])).toEqual([]);
    await expect(h.rpc(b, "update_manual_book", { p_book_id: book, p_book: { title: "x" } })).rejects.toThrow(/Only the person/);
    await h.rpc(a, "update_manual_book", { p_book_id: book, p_book: { title: "A Family Memoir, revised", authors: [] } });
    expect((await h.as(b, "select title from books where id = $1", [book]))[0]!.title).toContain("revised");
  });
  it("stops a manual entry being rewritten once a club has voted on it", async () => {
    const [a, b] = [await h.user(), await h.user()];
    const club = await h.club(a);
    await h.join(a, club, b);
    const mine = await h.manualBook(a, "Before the Vote");
    const cycle = await h.cycle(a, club);
    await h.rpc(a, "nominate", { p_cycle_id: cycle, p_book_id: mine });
    await h.rpc(b, "nominate", { p_cycle_id: cycle, p_book_id: await h.importBook("The Other One") });
    await h.rpc(a, "update_manual_book", { p_book_id: mine, p_book: { title: "Still Nominating", authors: [] } }); // nothing decided yet
    expect(await h.rpc(a, "can_edit_book", { p_book_id: mine })).toBe(true);
    await h.rpc(a, "open_voting_now", { p_cycle_id: cycle });
    await expect(h.rpc(a, "update_manual_book", { p_book_id: mine, p_book: { title: "Something Else", authors: [] } })).rejects.toThrow(/already voted on or chosen/);
    expect(await h.rpc(a, "can_edit_book", { p_book_id: mine })).toBe(false);
    expect((await h.sql("select title from books where id = $1", [mine]))[0]!.title).toBe("Still Nominating");
    await expect(h.rpc(a, "update_manual_book_fields", { p_book_id: mine, p_book: { title: "x" } })).rejects.toThrow(/does not exist|permission denied/);
  });
  it("limits how many search results one person can add", async () => {
    const a = await h.user();
    for (let i = 0; i < 60; i++) expect(await h.rpc(a, "consume_import_quota")).toBe(true);
    expect(await h.rpc(a, "consume_import_quota")).toBe(false);
    await expect(h.rpc(null, "consume_import_quota")).rejects.toThrow(/permission denied/);
  });
  it("rejects malformed manual entries", async () => {
    const a = await h.user();
    await expect(h.rpc(a, "create_manual_book", { p_book: { title: "  " } })).rejects.toThrow(/needs a title/);
    await expect(h.rpc(a, "create_manual_book", { p_book: { title: "x", isbn_13: "12" } })).rejects.toThrow(/thirteen digits/);
    await expect(h.rpc(a, "create_manual_book", { p_book: { title: "x", cover_url: "javascript:alert(1)" } })).rejects.toThrow(/check constraint/);
  });
});

describe("recommendations", () => {
  async function setup() {
    const [a, b, outsider] = [await h.user("A"), await h.user("B"), await h.user("O")];
    const [one, two] = [await h.club(a, "One"), await h.club(a, "Two")];
    await h.join(a, one, b);
    await h.join(a, two, outsider);
    const book = await h.importBook("The Left Hand of Darkness");
    await h.shelve(a, book);
    await h.as(a, "insert into personal_reviews (user_id, book_id, rating, review_text) values ($1, $2, 5, 'my private thoughts')", [a, book]);
    return { a, b, outsider, one, two, book };
  }
  it("reaches the chosen club only, with nothing private unless shared", async () => {
    const { a, b, outsider, one, book } = await setup();
    const id = await h.rpc(a, "recommend_book", { p_club_id: one, p_book_id: book, p_text: "Try this" });
    const [seen] = await h.as(b, "select * from club_recommendations where id = $1", [id]);
    expect(seen).toMatchObject({ recommendation_text: "Try this", shared_rating: null, shared_review_text: null });
    expect(await h.as(outsider, "select * from club_recommendations")).toEqual([]);
    expect(await h.as(outsider, "select * from club_books where book_id = $1", [book])).toEqual([]);
    expect(await h.as(b, "select * from personal_reviews")).toEqual([]);
  });
  it("shares a snapshot that later edits do not change", async () => {
    const { a, b, one, book } = await setup();
    const id = await h.rpc(a, "recommend_book", { p_club_id: one, p_book_id: book, p_share_rating: true, p_shared_review: "my private thoughts" });
    await h.as(a, "update personal_reviews set review_text = 'changed my mind', rating = 1 where book_id = $1", [book]);
    expect((await h.as(b, "select shared_rating, shared_review_text from club_recommendations where id = $1", [id]))[0]).toEqual({ shared_rating: 5, shared_review_text: "my private thoughts" });
    await h.rpc(a, "edit_recommendation", { p_id: id, p_text: "edited", p_rating_mode: "keep", p_shared_review: null });
    expect((await h.as(b, "select recommendation_text, shared_rating, shared_review_text from club_recommendations where id = $1", [id]))[0]).toEqual({ recommendation_text: "edited", shared_rating: 5, shared_review_text: null });
    await h.rpc(a, "edit_recommendation", { p_id: id, p_text: "edited", p_rating_mode: "update", p_shared_review: null });
    expect((await h.as(b, "select shared_rating from club_recommendations where id = $1", [id]))[0]!.shared_rating).toBe(1);
    await h.as(a, "delete from user_books where book_id = $1", [book]);
    expect(await h.as(b, "select 1 from club_recommendations where id = $1", [id])).toHaveLength(1);
  });
  it("can only be edited by its author, withdrawn by author or administrator", async () => {
    const { a, b, one, book } = await setup();
    const id = await h.rpc(a, "recommend_book", { p_club_id: one, p_book_id: book });
    await expect(h.rpc(b, "edit_recommendation", { p_id: id, p_text: "x", p_rating_mode: "keep", p_shared_review: null })).rejects.toThrow(/could not be found/);
    await expect(h.rpc(b, "withdraw_recommendation", { p_id: id })).rejects.toThrow(/could not be found/);
    await expect(h.as(b, "update club_recommendations set recommendation_text = 'x'")).rejects.toThrow(/permission denied/);
    expect(await h.as(b, "select 1 from notifications where reference_id = $1", [id])).toHaveLength(1);
    await h.rpc(a, "withdraw_recommendation", { p_id: id });
    expect(await h.as(b, "select * from club_recommendations where id = $1", [id])).toEqual([]);
    expect(await h.as(b, "select 1 from notifications where reference_id = $1", [id])).toEqual([]);
    expect(await h.as(a, "select withdrawn_at from club_recommendations where id = $1", [id])).toHaveLength(1);
    await h.rpc(a, "recommend_book", { p_club_id: one, p_book_id: book });
  });
  it("refuses other people's clubs, unshelved books and repeats", async () => {
    const { a, b, two, one, book } = await setup();
    await expect(h.rpc(b, "recommend_book", { p_club_id: two, p_book_id: book })).rejects.toThrow(/not a member/);
    await expect(h.rpc(b, "recommend_book", { p_club_id: one, p_book_id: book })).rejects.toThrow(/your own library/);
    await h.rpc(a, "recommend_book", { p_club_id: one, p_book_id: book });
    await expect(h.rpc(a, "recommend_book", { p_club_id: one, p_book_id: book })).rejects.toThrow(/already recommended/);
  });
  it("is never a nomination and costs no nomination", async () => {
    const { a, b, one, book } = await setup();
    const cycle = await h.cycle(a, one);
    await h.rpc(a, "recommend_book", { p_club_id: one, p_book_id: book });
    expect(await h.sql("select 1 from nominations where cycle_id = $1", [cycle])).toEqual([]);
    const other = await h.importBook("Another");
    await h.rpc(a, "nominate", { p_cycle_id: cycle, p_book_id: other });
    await h.rpc(b, "nominate", { p_cycle_id: cycle, p_book_id: book });
    expect(await h.sql("select 1 from nominations where cycle_id = $1", [cycle])).toHaveLength(2);
  });
  it("never leaks between a person's clubs", async () => {
    const { a, b, outsider, two, book } = await setup();
    await h.rpc(a, "recommend_book", { p_club_id: two, p_book_id: book, p_shared_review: "for two" });
    expect(await h.as(b, "select * from club_recommendations where book_id = $1", [book])).toEqual([]);
    expect(await h.as(outsider, "select shared_review_text from club_recommendations where book_id = $1", [book])).toEqual([{ shared_review_text: "for two" }]);
  });
  it("puts no prose in notifications", async () => {
    const cols = await h.sql("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'notifications' order by 1");
    expect(cols.map((c) => c.column_name)).toEqual(["actor_id", "club_id", "created_at", "id", "read_at", "reference_id", "type", "user_id"]);
  });
});

describe("club library", () => {
  it("keeps anything with history", async () => {
    const [a, b] = [await h.user(), await h.user()];
    const club = await h.club(a);
    await h.join(a, club, b);
    const [plain, nominated] = [await h.importBook("Plain"), await h.importBook("Nominated")];
    await h.rpc(b, "add_club_book", { p_club_id: club, p_book_id: plain });
    const cycle = await h.cycle(a, club);
    await h.rpc(b, "nominate", { p_cycle_id: cycle, p_book_id: nominated });
    await expect(h.rpc(b, "remove_club_book", { p_club_id: club, p_book_id: nominated })).rejects.toThrow(/history/);
    await h.rpc(b, "remove_club_book", { p_club_id: club, p_book_id: plain });
    expect(await h.as(a, "select 1 from club_books where club_id = $1", [club])).toHaveLength(1);
  });
  it("is closed to outsiders", async () => {
    const [a, outsider] = [await h.user(), await h.user()];
    const club = await h.club(a);
    const book = await h.importBook("Closed");
    await expect(h.rpc(outsider, "add_club_book", { p_club_id: club, p_book_id: book })).rejects.toThrow(/not a member/);
    await h.rpc(a, "add_club_book", { p_club_id: club, p_book_id: book });
    expect(await h.as(outsider, "select * from club_books where club_id = $1", [club])).toEqual([]);
  });
});
