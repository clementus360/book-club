import { BookCheck, ThumbsUp, BookMarked, BookOpen, BookPlus, CalendarDays, Library, MessagesSquare, Quote, Vote } from "lucide-react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { HeroCarousel } from "@/components/hero-carousel";
import { HERO_SLIDES } from "@/lib/hero";
import "./hero.css";

const STEPS = [
  ["Suggest books", "Recommend something you loved whenever it occurs to you. When it is time to choose, each member nominates one book."],
  ["Choose together", "Everyone puts the nominations in order. The points are added up in the open, and nobody’s vote is ever shown."],
  ["Read together", "See where the group is, gather questions and passages as you go, and take the time the book needs."],
  ["Meet and discuss", "Set a date and a place, agree who will lead, and write down what was worth keeping."],
] as const;

const FEATURES = [
  ["A shared club library", "Every book your club has suggested, nominated or read, with its story attached."],
  ["Choosing together", "One nomination each, a private vote, and a tie-break if you need one."],
  ["Reading progress", "Enough to know where everyone is. No streaks, no leaderboards."],
  ["Meetings", "The date, the place, the agenda and who is coming, all in one spot."],
  ["Discussion records", "Questions, notes and quotations, kept beside the book they belong to."],
  ["A personal library", "Your own shelves, ratings and reviews. Private, and yours whichever clubs you join or leave."],
  ["Private recommendations", "Recommend a book to one club in particular, sharing only what you choose to."],
  ["Books you have read", "For every one: what was nominated, how it was decided, and what you made of it."],
] as const;

const STEP_ICONS = [BookPlus, Vote, BookOpen, MessagesSquare];
const FEATURE_ICONS = [Library, Vote, BookOpen, CalendarDays, Quote, BookMarked, ThumbsUp, BookCheck];

export default function Home() {
  return (
    <>
      <section className="grid items-center gap-x-10 gap-y-8 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] lg:items-start lg:pt-0 lg:pb-10">
        <div className="lg:pt-24">
          <h1 className="text-[2.9rem] leading-[1.02] sm:text-6xl lg:text-[4.25rem]">Good books.<br />Better<br className="hidden lg:block" /> conversations.</h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-soft sm:text-xl">
            Commonplace gives a book club one shared place to choose what to read, read it together, and organise conversations worth having.
          </p>
          <p className="mt-3 max-w-md text-soft">It works for film, TV, anime and game clubs too.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-primary">Start a book club</Link>
            <Link href="#how-it-works" className="btn btn-plain">How it works</Link>
          </div>
        </div>
        <HeroCarousel slides={HERO_SLIDES} />
      </section>

      <section className="border-t border-rule py-10" aria-label="About the name">
        <p className="rubric">commonplace book, n.</p>
        <p className="mt-2 max-w-3xl font-serif text-lg leading-relaxed sm:text-xl">
          A notebook in which readers once copied out the passages, arguments and ideas they wanted to keep, arranged so they could be found again.
        </p>
      </section>

      <section id="how-it-works" className="scroll-mt-6 border-t border-rule py-14 lg:py-20" aria-labelledby="how">
        <h2 id="how" className="text-3xl sm:text-4xl">How it works</h2>
        <ol className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <li key={title}>
              <p className="rubric with-icon" aria-hidden><Icon of={STEP_ICONS[i]!} size="1.5rem" />{["i.", "ii.", "iii.", "iv."][i]}</p>
              <h3 className="mt-1 text-xl">{title}</h3>
              <p className="mt-2 text-soft">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-rule py-14 lg:py-20" aria-labelledby="inside">
        <div className="grid gap-10 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-16">
          <h2 id="inside" className="text-3xl leading-tight sm:text-4xl">What your club keeps here</h2>
          <dl className="grid sm:grid-cols-2 sm:gap-x-12">
            {FEATURES.map(([title, body], i) => (
              <div key={title} className="border-t border-rule py-5 first:border-t-0 first:pt-0 sm:[&:nth-child(2)]:border-t-0 sm:[&:nth-child(2)]:pt-0">
                <dt className="flex items-center gap-2.5 font-serif text-lg"><Icon of={FEATURE_ICONS[i]!} className="text-rubric" />{title}</dt>
                <dd className="mt-1 text-soft">{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-t border-rule pt-14 lg:pt-20" aria-labelledby="begin">
        <h2 id="begin" className="max-w-2xl text-3xl leading-tight sm:text-4xl">Three friends and a book is enough to begin.</h2>
        <p className="mt-3 max-w-xl text-soft">Clubs are private and by invitation. Read in any language, in any format, at any pace.</p>
        <Link href="/signup" className="btn btn-primary mt-8">Start a book club</Link>
      </section>
    </>
  );
}
