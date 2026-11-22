import { Library } from "lucide-react";
import { Labelled } from "@/components/icon";
import type { Metadata } from "next";
import Link from "next/link";
import { BookLine } from "@/components/book-line";
import { LiveFilter, LiveSelect } from "@/components/live-filter";
import { Empty, nameOf, PageHeader, Toolbar } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { must, requireClub } from "@/lib/viewer";

export const metadata: Metadata = { title: "Club shelf" };

const FILTERS = [["", "Everything"], ["read", "Read"], ["reading", "Reading now"], ["nominated", "Nominated"], ["recommended", "Recommended"], ["untried", "Not nominated yet"]] as const;

export default async function ClubLibrary({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const { show = "", q = "" } = await searchParams;
  const { supabase, club } = await requireClub();
  const [books, cycles, nominations, recs] = await Promise.all([
    supabase.from("club_books").select("*, book:books!club_books_book_id_fkey(*), adder:profiles!club_books_added_by_fkey(display_name)").eq("club_id", club.id).order("added_at", { ascending: false }),
    supabase.from("reading_cycles").select("id, number, book_id, status, completed_at").eq("club_id", club.id).not("book_id", "is", null),
    supabase.from("nominations").select("book_id, cycle:reading_cycles!nominations_cycle_id_club_id_fkey(number)").eq("club_id", club.id).is("withdrawn_at", null),
    supabase.from("club_recommendations").select("book_id").eq("club_id", club.id).is("withdrawn_at", null),
  ]);
  const all = must(books).map((b) => {
    const mine = must(cycles).filter((c) => c.book_id === b.book_id);
    const read = mine.filter((c) => c.status === "completed");
    const reading = mine.find((c) => c.status === "reading");
    const nominated = [...new Set(must(nominations).filter((n) => n.book_id === b.book_id).map((n) => n.cycle?.number))];
    const recommended = must(recs).filter((r) => r.book_id === b.book_id).length;
    const tags = new Set([read.length && "read", reading && "reading", nominated.length && "nominated", recommended && "recommended", !nominated.length && !mine.length && "untried"].filter(Boolean));
    return { ...b, read, reading, nominated, recommended, tags };
  });
  const needle = q.trim().toLowerCase();
  const list = all.filter((b) => (!show || b.tags.has(show)) && (!needle || b.book.search_text.includes(needle)));

  return (
    <>
      <PageHeader kicker={club.name} title="Club shelf" action={<Link className="btn btn-primary" href="/app/add-book?to=club"><Labelled>Add a book</Labelled></Link>}>Every book connected with this club. Adding one here does not put it in the vote.</PageHeader>
      <Toolbar label="Club shelf" tabs={[{ href: "/app/library", label: "All club books", current: true }, { href: "/app/archive", label: "Books we have read", current: false }]}>
        {all.length > 0 && <><LiveSelect name="show" label="Which books to show" options={FILTERS} /><LiveFilter label="Search the shelf" /></>}
      </Toolbar>
      {all.length === 0 ? (
        <Empty icon={Library} title="No books here yet" action={<Link className="btn btn-primary" href="/app/add-book?to=club"><Labelled>Add a book</Labelled></Link>}>Books appear here when someone adds, recommends or nominates one.</Empty>
      ) : (
        <div>
          {list.length === 0 ? <Empty title="Nothing here matches" action={<Link className="btn btn-plain" href="/app/library">Show everything</Link>} /> : list.map((b) => (
            <BookLine key={b.id} book={b.book}>
              <ul className="space-y-0.5 text-sm">
                {b.reading && <li><Link className="link" href="/app/current-book">Being read now</Link></li>}
                {b.read.map((c) => <li key={c.id}><Link className="link" href={`/app/archive/${c.id}`}>Read by the club{c.completed_at && `, finished ${formatDate(c.completed_at, club.timezone)}`}</Link></li>)}
                {b.nominated.length > 0 && <li className="text-soft">Nominated{b.nominated.length > 1 ? ` ${b.nominated.length} times` : ""}</li>}
                {b.recommended > 0 && <li className="text-soft">{b.recommended === 1 ? "Recommended by a member" : `Recommended by ${b.recommended} members`}</li>}
                <li className="text-soft">{b.added_by ? `Added by ${nameOf(b.adder)}, ` : "Added "}{formatDate(b.added_at, club.timezone)}</li>
              </ul>
            </BookLine>
          ))}
        </div>
      )}
    </>
  );
}
