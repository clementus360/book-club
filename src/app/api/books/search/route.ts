import { NextResponse, type NextRequest } from "next/server";
import { searchProviders } from "@/lib/books/search";
import { createClient } from "@/lib/supabase/server";

/** Books already in Commonplace first, then both providers. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return NextResponse.json({ error: "Sign in to search." }, { status: 401 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").normalize("NFC").trim().slice(0, 200);
  if ([...q].length < 2) return NextResponse.json({ local: [], results: [], unavailable: [] });

  // "local" looks only at books already in Commonplace: cheap, so it can follow typing closely.
  const localOnly = request.nextUrl.searchParams.get("scope") === "local";
  const { data: allowed } = localOnly ? { data: true } : await supabase.rpc("consume_search_quota");
  if (allowed === false) return NextResponse.json({ error: "That is a lot of searching. Please wait a few minutes." }, { status: 429 });

  const pattern = `%${q.toLowerCase().replace(/[\\%_]/g, "\\$&").replace(/\s+/g, "%")}%`;
  const [local, providers] = await Promise.all([
    supabase.from("books")
      .select("id, title, subtitle, authors, cover_url, publication_year, publisher, language, volume_number, edition_note, metadata_source, open_library_work_id, open_library_edition_id, google_books_id, isbn_13")
      .like("search_text", pattern).order("title").limit(8),
    localOnly ? { results: [], unavailable: [] } : searchProviders(q),
  ]);
  const known = local.data ?? [];
  // Do not offer again what is certainly the same record.
  const results = providers.results.filter(({ record: r }) => !known.some((b) =>
    (r.google_books_id && r.google_books_id === b.google_books_id) ||
    (r.open_library_edition_id && r.open_library_edition_id === b.open_library_edition_id) ||
    (r.isbn_13 && r.isbn_13 === b.isbn_13) ||
    // The same work with no particular edition chosen either time.
    (r.open_library_work_id && !r.open_library_edition_id && !b.open_library_edition_id &&
      r.open_library_work_id === b.open_library_work_id && r.language === b.language && r.volume_number === b.volume_number)));
  return NextResponse.json({ local: known, results, unavailable: providers.unavailable }, { headers: { "Cache-Control": "private, no-store" } });
}
