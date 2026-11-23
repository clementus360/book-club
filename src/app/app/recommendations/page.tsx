import { ThumbsUp } from "lucide-react";
import { Labelled } from "@/components/icon";
import type { Metadata } from "next";
import Link from "next/link";
import { BookLine } from "@/components/book-line";
import { ActionButton } from "@/components/forms/action-form";
import { EditRecommendation } from "@/components/recommend-form";
import { LiveSelect } from "@/components/live-filter";
import { Empty, nameOf, PageHeader, Rating, Toolbar } from "@/components/ui";
import { withdrawRecommendation } from "@/lib/actions/books";
import { words } from "@/lib/kinds";
import { formatDate } from "@/lib/dates";
import { getViewer, must } from "@/lib/viewer";

export const metadata: Metadata = { title: "Recommendations" };

export default async function Recommendations({ searchParams }: { searchParams: Promise<{ view?: string; club?: string }> }) {
  const { view, club: wanted } = await searchParams;
  const made = view === "made";
  const { supabase, userId, clubs, club } = await getViewer();
  const filterClub = clubs.find((c) => c.id === wanted) ?? null;
  const w = words(filterClub?.kind ?? club?.kind);
  const [recs, reviews, shelf] = await Promise.all([
    supabase.from("club_recommendations")
      .select("*, book:books!club_recommendations_book_id_fkey(*), recommender:profiles!club_recommendations_recommended_by_fkey(display_name), club:clubs!club_recommendations_club_id_fkey(name, timezone)")
      .is("withdrawn_at", null).order("created_at", { ascending: false }),
    supabase.from("personal_reviews").select("book_id, rating").eq("user_id", userId),
    supabase.from("user_books").select("book_id").eq("user_id", userId),
  ]);
  const ratingOf = new Map(must(reviews).map((r) => [r.book_id, r.rating]));
  const owned = new Set(must(shelf).map((s) => s.book_id));
  // A hand-entered book can pass out of sight once its recommender has left that
  // club and taken it off their own shelves, so the join can come back empty.
  const list = must(recs).filter((r) => (r.book as typeof r.book | null) && (r.recommended_by === userId) === made && (!filterClub || r.club_id === filterClub.id));
  const adminOf = new Set(clubs.filter((c) => c.role === "admin").map((c) => c.id));

  return (
    <>
      <PageHeader kicker="Across your clubs" title="Recommendations">{`Friendly suggestions between members. They are separate from the vote: to get ${w.a} into the vote, nominate it.`}</PageHeader>
      <Toolbar label="Recommendations" tabs={([["", "For you"], ["made", "Made by you"]] as const).map(([v, label]) => ({ label, current: made === (v === "made"), href: `/app/recommendations${v || filterClub ? `?${new URLSearchParams({ ...(v && { view: v }), ...(filterClub && { club: filterClub.id }) })}` : ""}` }))}>
        {clubs.length > 1 && <LiveSelect name="club" label="Which club" options={[["", "All clubs"], ...clubs.map((c) => [c.id, c.name] as const)]} />}
      </Toolbar>
      <div>
      {list.length === 0 ? (
        made ? (
          <Empty icon={ThumbsUp} title="You have not recommended anything yet" action={<Link className="btn btn-primary" href="/app/my-library"><Labelled>{`Open ${w.mine}`}</Labelled></Link>}>{`Open ${w.a} in ${w.mine} and choose Recommend to club.`}</Empty>
        ) : (
          <Empty icon={ThumbsUp} title="No recommendations yet">{clubs.length ? `When someone recommends ${w.a} to one of your clubs, it will appear here.` : "Join a club, and what its members recommend will appear here."}</Empty>
        )
      ) : list.map((r) => (
        <BookLine key={r.id} book={r.book} aside={
          <>
            {made && <EditRecommendation rec={r} currentRating={ratingOf.get(r.book_id) ?? null} />}
            {(made || adminOf.has(r.club_id)) && <ActionButton action={withdrawRecommendation} hidden={{ id: r.id }} className="btn-text danger" pending="Withdrawing…">{made ? "Withdraw" : "Remove"}</ActionButton>}
            {!made && (owned.has(r.book_id) ? <span className="meta self-center">{`In ${words(r.book.kind).mine}`}</span> : <Link className="btn-text inline-flex items-center" href={`/app/add-book?book=${r.book_id}`}><Labelled>{`Add to ${words(r.book.kind).mine}`}</Labelled></Link>)}
          </>
        }>
          <p className="meta">{made ? `To ${r.club?.name ?? "a club you have left"}` : `${nameOf(r.recommender)}, to ${r.club?.name}`}, {formatDate(r.created_at, r.club?.timezone)} <Rating value={r.shared_rating} /></p>
          {r.recommendation_text && <p className="written mt-2 max-w-prose">{r.recommendation_text}</p>}
          {r.shared_review_text && <blockquote className="written mt-3 max-w-prose border-l-2 border-rubric/60 pl-4">{r.shared_review_text}</blockquote>}
        </BookLine>
      ))}
      </div>
    </>
  );
}
