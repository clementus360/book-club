import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AddToClub, AddToLibrary, Nominate } from "@/components/add-book";
import { PageHeader } from "@/components/ui";
import { isUuid } from "@/lib/action";
import { getActiveCycle } from "@/lib/data/club";
import { isKind, words, type Kind } from "@/lib/kinds";
import { getViewer, must, requireClub } from "@/lib/viewer";

type Search = { to?: string; book?: string; like?: string; kind?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const { kind } = await searchParams;
  const { club } = await getViewer();
  return { title: `Add ${words(isKind(kind) ? kind : club?.kind).a}` };
}

export default async function AddBook({ searchParams }: { searchParams: Promise<Search> }) {
  const { to, book: bookId, like, kind: askedKind } = await searchParams;
  const { supabase, club: current } = await getViewer();
  const fetchBook = async (id?: string) => (isUuid(id) ? (await supabase.from("books").select("*").eq("id", id).maybeSingle()).data : null);
  const [initialBook, template] = await Promise.all([fetchBook(bookId), fetchBook(like)]);
  // "Add another volume" carries over what volumes share.
  const prefill = template && {
    title: template.series_title ?? template.title, authors: template.authors, series_title: template.series_title ?? template.title,
    format: template.format, language: template.language, publisher: template.publisher, original_title: null,
  };
  // What is being added: the club's kind for the club, otherwise what was asked for or opened.
  const own: Kind = initialBook?.kind ?? template?.kind ?? (isKind(askedKind) ? askedKind : current?.kind ?? "book");

  if (to === "club") {
    const { club } = await requireClub();
    const w = words(club.kind);
    const common = { initialBook: initialBook?.kind === club.kind ? initialBook : null, prefill, kind: club.kind };
    return <><PageHeader kicker={club.name} title="Add to the club shelf">{`Find ${w.a} for the whole club to see.`}</PageHeader><AddToClub key={bookId} clubId={club.id} clubName={club.name} {...common} /></>;
  }
  if (to === "nominate") {
    const { club, userId } = await requireClub();
    const cycle = await getActiveCycle();
    if (cycle?.status !== "nominating") redirect("/app/selection");
    const [mine, shelf] = await Promise.all([
      supabase.from("nominations").select("id, explanation").eq("cycle_id", cycle.id).eq("nominated_by", userId).is("withdrawn_at", null).maybeSingle(),
      supabase.from("club_books").select("book:books!club_books_book_id_fkey(*)").eq("club_id", club.id).order("added_at", { ascending: false }).limit(12),
    ]);
    const nominated = must(await supabase.from("nominations").select("book_id").eq("cycle_id", cycle.id).is("withdrawn_at", null));
    const taken = new Set(nominated.map((n) => n.book_id));
    const w = words(club.kind);
    const common = { initialBook: initialBook?.kind === club.kind ? initialBook : null, prefill, kind: club.kind };
    return (
      <>
        <PageHeader kicker={club.name} title={mine.data ? "Change your nomination" : `Nominate ${w.a}`}>{`Find one ${w.one} you would like the club to ${w.verb}. You can change your mind until nominations close.`}</PageHeader>
        <Nominate key={bookId} cycleId={cycle.id} nominationId={mine.data?.id ?? null} explanation={mine.data?.explanation ?? null}
          suggestions={must(shelf).flatMap((s) => (s.book && !taken.has(s.book.id) ? [s.book] : []))} {...common} />
      </>
    );
  }
  const w = words(own);
  return <><PageHeader kicker={w.mine} title={`Add ${w.a}`}>{`Only you can see your ${w.many}.`}</PageHeader><AddToLibrary key={`${own}:${bookId ?? like}`} initialBook={initialBook} prefill={prefill} kind={own} /></>;
}
