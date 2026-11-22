import { Bookmark, BookMarked, BookOpen, Check, Heart, Lock, MessageSquareText, NotebookPen } from "lucide-react";
import { Icon, Labelled } from "@/components/icon";
import type { Metadata } from "next";
import Link from "next/link";
import { BookLine } from "@/components/book-line";
import { LiveFilter } from "@/components/live-filter";
import { Empty, PageHeader, Rating, Toolbar } from "@/components/ui";
import type { Enums } from "@/lib/database.types";
import { formatPlainDate } from "@/lib/dates";
import { getViewer, must } from "@/lib/viewer";

export const metadata: Metadata = { title: "My books" };

const FILTERS = [["", "All"], ["currently_reading", "Reading now"], ["want_to_read", "Want to read"], ["read", "Read"], ["favourites", "Favourites"]] as const;
const LABEL: Record<Enums<"reading_status">, string> = { currently_reading: "Reading now", want_to_read: "Want to read", read: "Read" };

const GLYPH = { currently_reading: BookOpen, want_to_read: Bookmark, read: Check } as const;

export default async function MyLibrary({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const { show = "", q = "" } = await searchParams;
  const { supabase, userId } = await getViewer();
  const [entries, reviews] = await Promise.all([
    supabase.from("user_books").select("*, book:books!user_books_book_id_fkey(*)").eq("user_id", userId).order("updated_at", { ascending: false }),
    supabase.from("personal_reviews").select("book_id, rating, review_text").eq("user_id", userId),
  ]);
  const all = must(entries);
  const reviewOf = new Map(must(reviews).map((r) => [r.book_id, r]));
  const needle = q.trim().toLowerCase();
  const list = all.filter((e) =>
    (show === "" || (show === "favourites" ? e.is_favourite : e.status === show)) &&
    (!needle || e.book.search_text.includes(needle)));
  const count = (key: string) => all.filter((e) => key === "" || (key === "favourites" ? e.is_favourite : e.status === key)).length;

  return (
    <>
      <PageHeader icon={Lock} kicker="Only you can see this" title="My books" action={<Link className="btn btn-primary" href="/app/add-book"><Labelled>Add a book</Labelled></Link>}>Keep track of what you have read and want to read. Open a book to rate it, review it or recommend it.</PageHeader>
      {all.length === 0 ? (
        <Empty icon={BookMarked} title="You have not added any books yet" action={<Link className="btn btn-primary" href="/app/add-book"><Labelled>Add your first book</Labelled></Link>}>
          Start with one you loved. Your ratings, reviews and notes stay private unless you choose to share something with a club.
        </Empty>
      ) : (
        <>
          <Toolbar label="Filter by status" tabs={FILTERS.map(([key, label]) => ({ href: `/app/my-library${key || q ? `?${new URLSearchParams({ ...(key && { show: key }), ...(q && { q }) })}` : ""}`, current: show === key, label: <>{label}<span className="ml-1.5 text-sm">{count(key)}</span></> }))}>
            <LiveFilter label="Search my books" />
          </Toolbar>
          <div>
          {list.length === 0 ? <Empty title="Nothing here matches" action={<Link className="btn btn-plain" href="/app/my-library">Show everything</Link>} /> : list.map((e) => {
            const review = reviewOf.get(e.book_id);
            return (
              <BookLine key={e.id} book={e.book}>
                <p className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm">
                  <span className="with-icon"><Icon of={GLYPH[e.status]} />{LABEL[e.status]}{e.date_finished && e.status === "read" && `, finished ${formatPlainDate(e.date_finished)}`}</span>
                  {e.is_favourite && <span className="with-icon text-rubric"><Icon of={Heart} />Favourite</span>}
                  <Rating value={review?.rating ?? null} />
                  {review?.review_text && <span className="with-icon text-soft"><Icon of={MessageSquareText} />Reviewed</span>}
                  {e.private_notes && <span className="with-icon text-soft"><Icon of={NotebookPen} />Notes</span>}
                </p>
              </BookLine>
            );
          })}
          </div>
        </>
      )}
    </>
  );
}
