import type { Metadata } from "next";
import Link from "next/link";
import { BookCover } from "@/components/book-cover";
import { authorsOf } from "@/components/book-line";
import { Empty, PageHeader, Toolbar } from "@/components/ui";
import { METHOD_LABEL } from "@/lib/cycle";
import { dayRange } from "@/lib/dates";
import { must, requireClub } from "@/lib/viewer";

export const metadata: Metadata = { title: "Books we have read" };

export default async function Archive() {
  const { supabase, club } = await requireClub();
  const cycles = must(await supabase.from("reading_cycles").select("*, book:books!reading_cycles_book_id_fkey(*)")
    .eq("club_id", club.id).eq("status", "completed").order("completed_at", { ascending: false }));
  return (
    <>
      <PageHeader kicker={club.name} title="Books we have read">What you chose, when you met and what you said.</PageHeader>
      <Toolbar label="Club shelf" tabs={[{ href: "/app/library", label: "All club books", current: false }, { href: "/app/archive", label: "Books we have read", current: true }]} />
      {cycles.length === 0 ? (
        <Empty title="You have not finished a book together yet">When the club finishes a book, everything about it is kept here.</Empty>
      ) : (
        <ol>
          {cycles.map((c) => c.book && (
            <li key={c.id} className="row grid grid-cols-[4rem_minmax(0,1fr)] gap-4 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-5">
              <Link href={`/app/archive/${c.id}`} tabIndex={-1} aria-hidden><BookCover book={c.book} className="w-full" /></Link>
              <div >
                <p className="rubric">Book {c.number}</p>
                <h3 className="text-lg leading-snug"><Link className="hover:underline underline-offset-4" href={`/app/archive/${c.id}`}>{c.book.title}</Link></h3>
                <p className="text-soft">{authorsOf(c.book)}</p>
                <p className="meta mt-1">{dayRange(c.reading_starts_at, c.completed_at ?? c.reading_ends_at, club.timezone)}. {c.decision_method && `${METHOD_LABEL[c.decision_method]}.`}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
