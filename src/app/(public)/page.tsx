import Link from "next/link";

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

export default function Home() {
  return (
    <>
      <section className="grid gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-14 lg:py-20">
        <div>
          <h1 className="text-[2.9rem] leading-[1.02] sm:text-6xl lg:text-7xl">Good books.<br />Better conversations.</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-soft sm:text-xl">
            Commonplace gives a book club one shared place to choose what to read, read it together, and organise conversations worth having.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-primary">Start a book club</Link>
            <Link href="#how-it-works" className="btn btn-plain">How it works</Link>
          </div>
        </div>
        <aside className="self-end border-l-2 border-rubric/70 pl-6" aria-label="About the name">
          <p className="rubric">commonplace book, n.</p>
          <p className="mt-2 font-serif text-lg leading-relaxed">
            A notebook in which readers once copied out the passages, arguments and ideas they wanted to keep, arranged so they could be found again.
          </p>
        </aside>
      </section>

      <section id="how-it-works" className="scroll-mt-6 border-t border-rule py-14 lg:py-20" aria-labelledby="how">
        <h2 id="how" className="text-3xl sm:text-4xl">How it works</h2>
        <ol className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <li key={title}>
              <p className="rubric" aria-hidden>{["i.", "ii.", "iii.", "iv."][i]}</p>
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
            {FEATURES.map(([title, body]) => (
              <div key={title} className="border-t border-rule py-5 first:border-t-0 first:pt-0 sm:[&:nth-child(2)]:border-t-0 sm:[&:nth-child(2)]:pt-0">
                <dt className="font-serif text-lg">{title}</dt>
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
