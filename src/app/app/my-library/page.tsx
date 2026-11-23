import { Bookmark, BookMarked, BookOpen, Check, Heart, Lock, MessageSquareText, NotebookPen } from "lucide-react";
import { Icon, Labelled } from "@/components/icon";
import type { Metadata } from "next";
import Link from "next/link";
import { BookLine } from "@/components/book-line";
import { LiveFilter } from "@/components/live-filter";
import { Empty, PageHeader, Rating, Toolbar } from "@/components/ui";
import type { Enums } from "@/lib/database.types";
import { formatPlainDate } from "@/lib/dates";
import { isKind, KINDS, words, type Kind } from "@/lib/kinds";
import { getViewer, must } from "@/lib/viewer";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ kind?: string }> }): Promise<Metadata> {
  const { kind } = await searchParams;
  const { club } = await getViewer();
  return { title: words(isKind(kind) ? kind : club?.kind).mine };
}

const GLYPH = { currently_reading: BookOpen, want_to_read: Bookmark, read: Check } as const;

export default async function MyLibrary({ searchParams }: { searchParams: Promise<{ show?: string; q?: string; kind?: string }> }) {
  const params = await searchParams;
  const { show = "", q = "" } = params;
  const { supabase, userId, club, clubs } = await getViewer();
  // One private list for everything; it opens on the kind of the club you are in.
  const kind: Kind = isKind(params.kind) ? params.kind : club?.kind ?? "book";
  const w = words(kind);
  const FILTERS = [["", "All"], ["currently_reading", w.now], ["want_to_read", w.want], ["read", w.done], ["favourites", "Favourites"]] as const;
  const LABEL: Record<Enums<"reading_status">, string> = { currently_reading: w.now, want_to_read: w.want, read: w.done };
  const [entries, reviews] = await Promise.all([
    supabase.from("user_books").select("*, book:books!user_books_book_id_fkey(*)").eq("user_id", userId).order("updated_at", { ascending: false }),
    supabase.from("personal_reviews").select("book_id, rating, review_text").eq("user_id", userId),
  ]);
  const everything = must(entries);
  const kinds = KINDS.filter((k) => k === kind || clubs.some((c) => c.kind === k) || everything.some((e) => e.book.kind === k));
  const all = everything.filter((e) => e.book.kind === kind);
  const here = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(params.kind && { kind }), ...extra });
    return `/app/my-library${p.size ? `?${p}` : ""}`;
  };
  const addHref = `/app/add-book${kind !== (club?.kind ?? "book") ? `?kind=${kind}` : ""}`;
  const reviewOf = new Map(must(reviews).map((r) => [r.book_id, r]));
  const needle = q.trim().toLowerCase();
  const list = all.filter((e) =>
    (show === "" || (show === "favourites" ? e.is_favourite : e.status === show)) &&
    (!needle || e.book.search_text.includes(needle)));
  const count = (key: string) => all.filter((e) => key === "" || (key === "favourites" ? e.is_favourite : e.status === key)).length;

  return (
    <>
      <PageHeader icon={Lock} kicker="Only you can see this" title={w.mine} action={<Link className="btn btn-primary" href={addHref}><Labelled>{`Add ${w.a}`}</Labelled></Link>}>{`Keep track of what you have ${w.verbed} and want to ${w.verb}. Open ${w.a} to rate it, review it or recommend it.`}</PageHeader>
      {kinds.length > 1 && (
        <nav aria-label="What kind" className="block-gap -mt-2 flex flex-wrap gap-2">
          {kinds.map((k) => <Link key={k} href={`/app/my-library?kind=${k}`} aria-current={k === kind ? "page" : undefined} className="rounded-full border border-rule px-3.5 py-1.5 text-sm text-soft hover:text-ink aria-[current]:border-ink aria-[current]:text-ink">{words(k).label}</Link>)}
        </nav>
      )}
      {all.length === 0 ? (
        <Empty icon={BookMarked} title={`You have not added any ${w.many} yet`} action={<Link className="btn btn-primary" href={addHref}><Labelled>{`Add your first ${w.one}`}</Labelled></Link>}>
          Start with one you loved. Your ratings, reviews and notes stay private unless you choose to share something with a club.
        </Empty>
      ) : (
        <>
          <Toolbar label="Filter by status" tabs={FILTERS.map(([key, label]) => ({ href: here({ ...(key && { show: key }), ...(q && { q }) }), current: show === key, label: <>{label}<span className="ml-1.5 text-sm">{count(key)}</span></> }))}>
            <LiveFilter label={`Search ${w.mine.toLowerCase()}`} />
          </Toolbar>
          <div>
          {list.length === 0 ? <Empty title="Nothing here matches" action={<Link className="btn btn-plain" href={here({})}>Show everything</Link>} /> : list.map((e) => {
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
