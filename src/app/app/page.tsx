import { Icon, Labelled } from "@/components/icon";
import type { Metadata } from "next";
import Link from "next/link";
import { BookCover } from "@/components/book-cover";
import { authorsOf } from "@/components/book-line";
import { eventIcon } from "@/components/event-icon";
import { isUpcoming, MeetingLine } from "@/components/meeting-line";
import { NextStepBox, Steps } from "@/components/guide";
import { nameOf, PageHeader, Section, Side, WithMargin } from "@/components/ui";
import { nextDeadline } from "@/lib/cycle";
import { getActiveCycle, getMeetings, getNominations } from "@/lib/data/club";
import { getGuide } from "@/lib/data/guide";
import { dayRange, fromNow } from "@/lib/dates";
import { describeEvent } from "@/lib/events";
import { words } from "@/lib/kinds";
import { must, requireClub } from "@/lib/viewer";

export const metadata: Metadata = { title: "Home" };

export default async function Home() {
  const { supabase, club, userId } = await requireClub();
  const [cycle, meetings, guide, recs, activity, shelf] = await Promise.all([
    getActiveCycle(), getMeetings(), getGuide(),
    supabase.from("club_recommendations").select("id, created_at, recommended_by, book:books!club_recommendations_book_id_fkey(id, title, authors, cover_url), recommender:profiles!club_recommendations_recommended_by_fkey(display_name)").eq("club_id", club.id).is("withdrawn_at", null).order("created_at", { ascending: false }).limit(4),
    supabase.from("activity_events").select("id, type, reference_id, created_at, actor:profiles!activity_events_actor_id_fkey(display_name), book:books!activity_events_book_id_fkey(title)").eq("club_id", club.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("user_books").select("status, book:books!user_books_book_id_fkey(id, title, kind)").eq("user_id", userId).eq("status", "currently_reading").order("updated_at", { ascending: false }).limit(20),
  ]);
  const nominations = cycle && cycle.status !== "reading" ? await getNominations(cycle.id) : [];
  const deadline = cycle && nextDeadline(cycle, club.kind);
  const next = meetings.find(isUpcoming);
  const w = words(club.kind);
  // What you are reading, watching or playing yourself, of this club's kind.
  const mineNow = must(shelf).filter((s) => s.book.kind === club.kind).slice(0, 3);

  return (
    <>
      <PageHeader kicker="Your club" title={club.name}>{club.description}</PageHeader>
      {club.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={club.image_url} alt="" referrerPolicy="no-referrer" className="block-gap max-h-48 max-w-full object-cover" />
      )}
      <NextStepBox step={guide.step} />
      <Steps current={guide.current} kind={club.kind} />
      <WithMargin margin={
        <>
          <Side title="Lately">
            <ul className="space-y-3">
              {must(activity).map((e) => {
                const { text, href } = describeEvent({ ...e, actor: nameOf(e.actor), book: e.book?.title, kind: club.kind });
                return <li key={e.id} className="flex gap-2.5 leading-snug"><Icon of={eventIcon(e.type)} className="mt-0.5 text-soft" /><span><Link href={href} className="underline-offset-4 hover:underline">{text}</Link><span className="meta block">{fromNow(e.created_at)}</span></span></li>;
              })}
            </ul>
          </Side>
          <Side title="Just for you">
            {mineNow.length > 0 && <ul className="mb-3 space-y-1.5">{mineNow.map((s) => <li key={s.book.id}><Link className="font-serif underline-offset-4 hover:underline" href={`/app/books/${s.book.id}`}>{s.book.title}</Link></li>)}</ul>}
            <Link className="link" href="/app/my-library"><Labelled>{`Open ${w.mine}`}</Labelled></Link>
          </Side>
        </>
      }>
        {cycle?.status === "reading" && cycle.book ? (
          <Section title={w.now} aside={<Link className="link" href="/app/current-book"><Labelled>Open</Labelled></Link>}>
            <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-6">
              <Link href="/app/current-book" tabIndex={-1} aria-hidden><BookCover book={cycle.book} className="w-full" priority /></Link>
              <div className="self-center">
                <h3 className="text-2xl leading-tight"><Link className="decoration-1 underline-offset-4 hover:underline" href="/app/current-book">{cycle.book.title}</Link></h3>
                <p className="mt-1">{authorsOf(cycle.book)}</p>
                <p className="meta mt-2">{dayRange(cycle.reading_starts_at, cycle.reading_ends_at, club.timezone)}</p>
                {deadline && <p className="meta">{deadline.label} {fromNow(deadline.at)}</p>}
              </div>
            </div>
          </Section>
        ) : nominations.length > 0 ? (
          <Section title="Nominated so far" aside={<Link className="link" href="/app/selection"><Labelled>See all</Labelled></Link>}>
            <ul className="flex flex-wrap gap-4">{nominations.map((n) => <li key={n.id}><Link href={`/app/books/${n.book_id}`} className="block"><BookCover book={n.book} className="w-16 sm:w-20" /><span className="sr-only">{n.book.title}</span></Link></li>)}</ul>
          </Section>
        ) : null}

        <Section title="Next meeting" aside={<Link className="link" href="/app/meetings"><Labelled>See all</Labelled></Link>}>
          {next ? <MeetingLine m={next} /> : <p className="text-soft">Nothing is arranged yet.</p>}
        </Section>

        <Section title="Recommended by members" aside={must(recs).length > 0 && <Link className="link" href="/app/recommendations"><Labelled>See all</Labelled></Link>}>
          {must(recs).length === 0 ? <p className="text-soft">{`No one has recommended ${w.a} to this club yet.`}</p> : (
            <ul className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-4">
              {must(recs).map((r) => (
                <li key={r.id}>
                  <Link href={`/app/books/${r.book.id}`} className="group block">
                    <BookCover book={r.book} className="w-full max-w-32" />
                    <span className="mt-2 block font-serif leading-snug group-hover:underline underline-offset-4">{r.book.title}</span>
                  </Link>
                  <span className="meta block">{r.recommended_by === userId ? "You" : nameOf(r.recommender)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </WithMargin>
    </>
  );
}
