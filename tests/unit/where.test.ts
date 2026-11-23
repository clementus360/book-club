import { afterEach, describe, expect, it, vi } from "vitest";
import { googleWaysFrom, searchWays, waysToGet } from "@/lib/books/where";

const book = (over = {}) => ({
  title: "Kindred", authors: ["Octavia E. Butler"], isbn_13: null, isbn_10: null,
  open_library_work_id: null, open_library_edition_id: null, google_books_id: null, ...over,
});
const answer = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => { vi.unstubAllGlobals(); delete process.env.GOOGLE_BOOKS_API_KEY; });

describe("where to get a book", () => {
  it("builds search links from the ISBN, or else the title and author", () => {
    const withIsbn = searchWays(book({ isbn_13: "9780807083697" }));
    expect(withIsbn.map((w) => w.href)).toEqual([
      "https://search.worldcat.org/search?q=bn%3A9780807083697",
      "https://www.amazon.com/s?k=9780807083697&i=stripbooks",
      "https://www.abebooks.com/servlet/SearchResults?isbn=9780807083697",
    ]);
    expect(searchWays(book())[0]?.href).toBe("https://search.worldcat.org/search?q=Kindred%20Octavia%20E.%20Butler");
  });

  it("reads Google's sale and free information, and only trusts Google links", () => {
    expect(googleWaysFrom({ saleInfo: { saleability: "FOR_SALE", buyLink: "https://play.google.com/store/books/details?id=x", retailPrice: { amount: 9.99, currencyCode: "EUR" } } }))
      .toEqual([{ kind: "buy", label: "Buy the e-book", note: "Google Play Books, €9.99", href: "https://play.google.com/store/books/details?id=x" }]);
    expect(googleWaysFrom({ saleInfo: { saleability: "FOR_SALE", buyLink: "https://evil.example/play.google.com" } })).toEqual([]);
    expect(googleWaysFrom({ saleInfo: { saleability: "FREE", buyLink: "https://play.google.com/store/books/details?id=y" } })[0]?.kind).toBe("free");
    expect(googleWaysFrom({ accessInfo: { publicDomain: true, viewability: "ALL_PAGES", webReaderLink: "https://play.google.com/books/reader?id=z" } })[0]?.note).toBe("Google Books, out of copyright");
    expect(googleWaysFrom({ saleInfo: { saleability: "NOT_FOR_SALE" }, accessInfo: { viewability: "PARTIAL" } })).toEqual([]);
    expect(googleWaysFrom(null)).toEqual([]);
  });

  it("asks both services once, in the reader's country, and puts free and borrowable copies first", async () => {
    process.env.GOOGLE_BOOKS_API_KEY = "k";
    const asked: string[] = [];
    vi.stubGlobal("fetch", (url: URL) => {
      asked.push(String(url));
      return String(url).includes("openlibrary")
        ? answer({ docs: [{ key: "/works/OL2W", ebook_access: "public", lending_edition_s: "OL9M" }] })
        : answer({ saleInfo: { saleability: "FREE", buyLink: "https://play.google.com/store/books/details?id=g" } });
    });
    const ways = await waysToGet(book({ open_library_work_id: "OL2W", google_books_id: "abc123" }), "RW");
    expect(ways.map((w) => w.label)).toEqual(["Read it free", "Find it in a library", "Look for it on Amazon", "Look for it on AbeBooks"]);
    expect(ways[0]?.href).toBe("https://openlibrary.org/books/OL9M");
    expect(asked).toHaveLength(2);
    const google = new URL(asked.find((u) => u.includes("googleapis"))!);
    expect(google.pathname).toBe("/books/v1/volumes/abc123");
    expect(google.searchParams.get("country")).toBe("RW");
    expect(google.searchParams.get("key")).toBe("k");
  });

  it("offers borrowing, ignores copies only for print-disabled readers, and survives outages", async () => {
    vi.stubGlobal("fetch", (url: URL) => String(url).includes("openlibrary")
      ? answer({ docs: [{ key: "/works/OL1W", ebook_access: "borrowable" }] })
      : answer({}, 503));
    const ways = await waysToGet(book({ isbn_13: "9780441478125" }), null);
    expect(ways[0]).toMatchObject({ kind: "borrow", href: "https://openlibrary.org/works/OL1W" });

    vi.stubGlobal("fetch", () => answer({ docs: [{ key: "/works/OL1W", ebook_access: "printdisabled" }] }));
    expect((await waysToGet(book({ isbn_13: "9780441478125" }), null)).map((w) => w.kind)).toEqual(["library", "buy", "buy"]);

    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("offline")));
    expect(await waysToGet(book({ isbn_13: "9780441478125", google_books_id: "abc123" }), null)).toHaveLength(3);
  });

  it("does not ask anyone when there is nothing to look up by", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await waysToGet(book(), null)).toHaveLength(3);
    expect(fetch).not.toHaveBeenCalled();
  });
});
