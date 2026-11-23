import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fromGoogle } from "@/lib/books/google-books";
import { isSamePublication, mergeResults } from "@/lib/books/merge";
import { asIsbn, fold, inferFormat, isbn10to13, normalizeLanguage, parseVolume, pickIsbns, plainText, trustedCover } from "@/lib/books/normalize";
import { fromOpenLibrary, toQuery } from "@/lib/books/open-library";
import { appendResults, searchProviders } from "@/lib/books/search";
import { readToken, signRecord } from "@/lib/books/token";
import type { BookRecord } from "@/lib/books/types";

beforeAll(() => { process.env.SUPABASE_SECRET_KEY = "test-secret"; });

const book = (over: Partial<BookRecord> = {}): BookRecord => ({
  title: "T", original_title: null, alternative_titles: [], subtitle: null, authors: ["A"], description: null, cover_url: null,
  publisher: null, publication_date: null, publication_year: null, language: null, isbn_10: null, isbn_13: null, format: null,
  series_title: null, volume_number: null, page_count: null, open_library_work_id: null, open_library_edition_id: null,
  google_books_id: null, metadata_source: "open_library", ...over,
});

describe("volumes", () => {
  it.each([
    ["One Piece, Vol. 12", "One Piece", "12"],
    ["Berserk Volume 03", "Berserk", "3"],
    ["Spice and Wolf, Vol. 1 (light novel)", "Spice and Wolf", "1"],
    ["鬼滅の刃 第5巻", "鬼滅の刃", "5"],
    ["進撃の巨人（１２）", "進撃の巨人", "12"],
    ["나 혼자만 레벨업 3권", "나 혼자만 레벨업", "3"],
    ["海辺のカフカ. 上", "海辺のカフカ", "上"],
    ["Saga #4", "Saga", "4"],
    ["해변의 카프카 - 하", "해변의 카프카", "하"],
  ])("finds the volume in %s", (title, series, volume) => {
    expect(parseVolume(title)).toEqual({ series, volume });
  });
  it.each(["Catch-22", "1984", "Fahrenheit 451", "2666", "The Book Thief", "Slaughterhouse-Five", "Station Eleven", "海辺のカフカ"])(
    "does not invent one in %s", (title) => expect(parseVolume(title)).toBeNull(),
  );
});

describe("identifiers and languages", () => {
  it("validates and converts ISBNs", () => {
    expect(asIsbn("978-0-441-47812-5")).toBe("9780441478125");
    expect(asIsbn("0441478123")).toBe("0441478123");
    expect(asIsbn("9780441478126")).toBeNull();
    expect(isbn10to13("0441478123")).toBe("9780441478125");
    expect(pickIsbns(["garbage", "0441478123"])).toEqual({ isbn_10: "0441478123", isbn_13: "9780441478125" });
    expect(pickIsbns(undefined)).toEqual({ isbn_10: null, isbn_13: null });
  });
  it("normalises language codes", () => {
    expect(["jpn", "chi", "en", "pt-BR", "kin", "und", null].map(normalizeLanguage)).toEqual(["ja", "zh", "en", "pt", "rw", null, null]);
  });
  it("folds without destroying other scripts", () => {
    expect(fold("Les Misérables!")).toBe("les miserables");
    expect(fold("海辺のカフカ")).toContain("海辺の");
    expect(fold("채식주의자")).toBe("채식주의자");
  });
  it("infers format only from explicit subjects", () => {
    expect(inferFormat(["Comics & Graphic Novels / Manga / General"])).toBe("manga");
    expect(inferFormat(["Manhwa"])).toBe("manhwa");
    expect(inferFormat(["Fiction", "Light novels"])).toBe("light_novel");
    expect(inferFormat(["Fiction"])).toBeNull();
  });
  it("trusts only provider covers over https", () => {
    expect(trustedCover("http://books.google.com/books/content?id=x&edge=curl")).toBe("https://books.google.com/books/content?id=x");
    expect(trustedCover("https://evil.test/track.gif")).toBeNull();
    expect(trustedCover("javascript:alert(1)")).toBeNull();
  });
  it("strips markup from descriptions", () => {
    expect(plainText("<p>One</p><b>Two</b> &amp; three")).toBe("One\nTwo & three");
  });
});

describe("adapters", () => {
  it("keeps a work-level Open Library record bare", () => {
    const r = fromOpenLibrary({ key: "/works/OL59800W", title: "The Left Hand of Darkness", author_name: ["Ursula K. Le Guin"], first_publish_year: 1969, cover_i: 5, language: ["eng", "fre"], editions: { docs: [{ key: "/books/OL1M", title: "The Left Hand of Darkness" }] } }, "left hand")!;
    expect(r).toMatchObject({ open_library_work_id: "OL59800W", open_library_edition_id: null, language: null, publication_year: 1969, cover_url: "https://covers.openlibrary.org/b/id/5-L.jpg" });
  });
  it("adopts a translated edition and preserves the original title", () => {
    const r = fromOpenLibrary({ key: "/works/OL1W", title: "海辺のカフカ", author_name: ["村上春樹"], editions: { docs: [{ key: "/books/OL2M", title: "Kafka on the Shore", language: ["eng"], isbn: ["9781400079278"] }] } }, "kafka on the shore")!;
    expect(r).toMatchObject({ title: "Kafka on the Shore", original_title: "海辺のカフカ", language: "en", open_library_edition_id: "OL2M", isbn_13: "9781400079278" });
  });
  it("builds queries Open Library accepts", () => {
    expect(toQuery("三体")).toBe('"三体"');
    expect(toQuery('Dune: "Messiah" (1969)')).toBe("Dune Messiah 1969");
    expect(toQuery("L'Étranger")).toBe("L'Étranger");
    expect(toQuery("978-0-441-47812-5")).toBe("9780441478125");
  });
  it("takes the volume from the work when the edition does not say", () => {
    const r = fromOpenLibrary({ key: "/works/OL1W", title: "海辺のカフカ. 上", editions: { docs: [{ key: "/books/OL2M", title: "海辺のカフカ", language: ["jpn"] }] } }, "海辺のカフカ")!;
    expect(r).toMatchObject({ title: "海辺のカフカ", volume_number: "上", original_title: null, alternative_titles: ["海辺のカフカ. 上"] });
  });
  it("reads Google volumes, including ones with almost nothing", () => {
    expect(fromGoogle({ id: "g", volumeInfo: { title: "Chainsaw Man, Vol. 2", categories: ["Comics & Graphic Novels / Manga"], publishedDate: "2020-12", language: "en" } }))
      .toMatchObject({ google_books_id: "g", series_title: "Chainsaw Man", volume_number: "2", format: "manga", publication_year: 2020, isbn_13: null, cover_url: null, authors: [] });
    expect(fromGoogle({ id: "g" })).toBeNull();
  });
});

describe("merging", () => {
  it("joins the same ISBN and fills gaps", () => {
    const out = mergeResults([book({ isbn_13: "9780441478125", open_library_work_id: "W" })], [book({ isbn_13: "9780441478125", google_books_id: "g", description: "D", metadata_source: "google_books" })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ open_library_work_id: "W", google_books_id: "g", description: "D", metadata_source: "open_library" });
  });
  it("keeps volumes, editions and lookalike titles apart", () => {
    expect(isSamePublication(book({ isbn_13: "x", volume_number: "1" }), book({ isbn_13: "x", volume_number: "2" }))).toBe(false);
    expect(mergeResults([book({ title: "The Vegetarian" })], [book({ title: "The Vegetarian" })])).toHaveLength(2);
    expect(isSamePublication(book({ open_library_work_id: "W" }), book({ open_library_work_id: "W" }))).toBe(false);
  });
});

describe("signed results", () => {
  it("round-trips and rejects tampering", () => {
    const token = signRecord(book({ title: "Kindred" }));
    expect(readToken(token)?.title).toBe("Kindred");
    const forged = `${Buffer.from(JSON.stringify(book({ title: "Forged" }))).toString("base64url")}.${token.split(".")[1]}`;
    expect(readToken(forged)).toBeNull();
    expect(readToken("nonsense")).toBeNull();
  });
});

describe("searching", () => {
  afterEach(() => vi.unstubAllGlobals());
  const ol = { docs: [{ key: "/works/W", title: "Found", author_name: ["A"] }] };
  const gb = { items: [{ id: "g", volumeInfo: { title: "Also found" } }] };
  const stub = (open: () => Promise<Response>, google: () => Promise<Response>) =>
    vi.stubGlobal("fetch", (url: URL) => (String(url).includes("openlibrary") ? open() : google()));
  const json = (body: unknown) => async () => new Response(JSON.stringify(body));

  it("uses both providers", async () => {
    stub(json(ol), json(gb));
    expect((await searchProviders("x")).results.map((r) => r.record.title)).toEqual(["Found", "Also found"]);
  });
  it.each([
    ["Open Library", async () => { throw new Error("down"); }, json(gb), ["Also found"]],
    ["Google Books", json(ol), async () => new Response("", { status: 429 }), ["Found"]],
  ] as const)("survives %s failing", async (name, o, g, titles) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stub(o, g);
    const out = await searchProviders("x");
    expect(out.unavailable).toEqual([name]);
    expect(out.results.map((r) => r.record.title)).toEqual(titles);
  });
  const later = (ms: number, body: unknown) => (_url: URL, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    const t = setTimeout(() => resolve(new Response(JSON.stringify(body))), ms);
    init?.signal?.addEventListener("abort", () => { clearTimeout(t); reject(init.signal!.reason); });
  });
  const slow = (o: ReturnType<typeof later>, g: ReturnType<typeof later>) =>
    vi.stubGlobal("fetch", (url: URL, init?: RequestInit) => (String(url).includes("openlibrary") ? o(url, init) : g(url, init)));

  it("shows a fast catalogue without waiting for a slow one, and adds the slow one after", async () => {
    slow(later(300, ol), later(10, gb));
    const seen: string[][] = [];
    const out = await searchProviders("x", { together: 50, onceOneAnswered: 2000, onUpdate: (p) => seen.push([...p.results.map((r) => r.record.title), `waiting: ${p.waiting.join()}`]) });
    expect(seen).toEqual([["Also found", "waiting: Open Library"], ["Also found", "Found", "waiting: "]]);
    expect(out.results.map((r) => r.record.title)).toEqual(["Also found", "Found"]);
  });
  it("gives up on a slow catalogue once the other has answered", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    slow(later(5000, ol), later(10, gb));
    const started = Date.now();
    const out = await searchProviders("x", { together: 50, onceOneAnswered: 200 });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(out).toMatchObject({ unavailable: ["Open Library"] });
    expect(out.results.map((r) => r.record.title)).toEqual(["Also found"]);
  });
  it("stops both when the person stops waiting", async () => {
    slow(later(5000, ol), later(5000, gb));
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 30);
    const started = Date.now();
    expect((await searchProviders("x", { signal: stop.signal })).unavailable).toHaveLength(2);
    expect(Date.now() - started).toBeLessThan(1000);
  });
  it("never moves what is already shown", () => {
    const a = book({ title: "A", isbn_13: "9780000000001" }), b = book({ title: "B", isbn_13: "9780000000002" });
    const out = appendResults([a, b], [book({ title: "B again", isbn_13: "9780000000002", description: "More" }), book({ title: "C" })]);
    expect(out.map((r) => [r.title, r.description])).toEqual([["A", null], ["B", "More"], ["C", null]]);
    expect(appendResults([a], [b], 1)).toEqual([a]);
  });
  it("survives both failing", async () => {
    stub(async () => { throw new Error("down"); }, async () => { throw new Error("down"); });
    expect(await searchProviders("x")).toEqual({ results: [], unavailable: ["Open Library", "Google Books"] });
  });
});
