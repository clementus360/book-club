import { NextResponse, type NextRequest } from "next/server";
import { searchProviders, type ProviderProgress } from "@/lib/books/search";
import { createClient } from "@/lib/supabase/server";

type Known = { google_books_id: string | null; open_library_edition_id: string | null; open_library_work_id: string | null; isbn_13: string | null; language: string | null; volume_number: string | null };

/** Do not offer again what is certainly the same record. */
const unknown = (known: Known[]) => (p: ProviderProgress): ProviderProgress => ({
  ...p,
  results: p.results.filter(({ record: r }) => !known.some((b) =>
    (r.google_books_id && r.google_books_id === b.google_books_id) ||
    (r.open_library_edition_id && r.open_library_edition_id === b.open_library_edition_id) ||
    (r.isbn_13 && r.isbn_13 === b.isbn_13) ||
    // The same work with no particular edition chosen either time.
    (r.open_library_work_id && !r.open_library_edition_id && !b.open_library_edition_id &&
      r.open_library_work_id === b.open_library_work_id && r.language === b.language && r.volume_number === b.volume_number))),
});

/**
 * Books already in Commonplace, then both catalogues. A full search answers in
 * lines of JSON, one each time there is more to show, the last with `done`.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return NextResponse.json({ error: "Sign in to search." }, { status: 401 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").normalize("NFC").trim().slice(0, 200);
  if ([...q].length < 2) return NextResponse.json({ local: [], results: [], unavailable: [] });

  // "local" looks only at books already in Commonplace: cheap, so it can follow typing closely.
  const localOnly = request.nextUrl.searchParams.get("scope") === "local";
  const pattern = `%${q.toLowerCase().replace(/[\\%_]/g, "\\$&").replace(/\s+/g, "%")}%`;
  const [local, quota] = await Promise.all([
    supabase.from("books")
      .select("id, title, subtitle, authors, cover_url, publication_year, publisher, language, volume_number, edition_note, metadata_source, open_library_work_id, open_library_edition_id, google_books_id, isbn_13")
      .like("search_text", pattern).order("title").limit(8),
    localOnly ? null : supabase.rpc("consume_search_quota"),
  ]);
  if (quota?.data === false) return NextResponse.json({ error: "That is a lot of searching. Please wait a few minutes." }, { status: 429 });
  const known = local.data ?? [];
  if (localOnly) return NextResponse.json({ local: known, results: [], unavailable: [] }, { headers: { "Cache-Control": "private, no-store" } });

  const strip = unknown(known);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: object) => { try { controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`)); } catch { /* the reader has gone */ } };
      send({ local: known, results: [], unavailable: [], waiting: ["Open Library", "Google Books"] });
      const final = await searchProviders(q, { signal: request.signal, onUpdate: (p) => { if (p.waiting.length) send({ local: known, ...strip(p) }); } });
      send({ local: known, ...strip({ ...final, waiting: [] }), done: true });
      try { controller.close(); } catch { /* already closed */ }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "private, no-store", "X-Accel-Buffering": "no" } });
}
