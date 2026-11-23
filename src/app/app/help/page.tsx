import type { Metadata } from "next";
import Link from "next/link";
import { Fold } from "@/components/fold";
import { PageHeader, Section } from "@/components/ui";
import { glossary } from "@/lib/help";
import { cap, words, type Words } from "@/lib/kinds";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Help and guide" };

const story = ({ kind, one, many, a, verb, verbed }: Words) => [
  ["Invite your friends", "On the Members page, make a link for each friend and send it to them. When they open it, they join."],
  ["Nominate", `An administrator starts choosing ${a}. Everyone gets a few days to nominate one ${one} they would like the club to ${verb}.`],
  ["Vote", `Put the nominated ${many} in order, with your favourite at the top. Your vote is private. The ${one} with the most points wins.`],
  [cap(verb), kind === "book"
    ? "Read the winning book at your own pace. You can say where you are, and save questions and passages for the meeting."
    : `${cap(verb)} the winning ${one} at your own pace. You can say where you are, and save questions and quotations for the meeting.`],
  ["Meet", "An administrator sets a date and a place, or asks everyone which times suit them. Say whether you are coming, then meet and talk."],
  ["Finish, and start again", `Write a short review if you like. The administrator finishes the ${one}, it joins the ${many} you have ${verbed}, and you choose the next one.`],
] as const;

const faq = ({ one, a, verb, mine }: Words) => [
  ["How do I know what to do next?", "Go to Home. The box at the top always tells you, with a button that takes you there. If it says there is nothing you have to do, you are waiting for other people."],
  ["What is the difference between recommending and nominating?", `Recommending is a friendly suggestion you can make at any time. Nominating puts ${a} into the club’s vote, and you get one nomination each time the club chooses ${a}.`],
  ["Who can see my reviews and notes?", `Only you, for anything in ${mine}. A club review, a question or a note on the club’s ${one} can be read by everyone in that club.`],
  ["Can anyone see how I voted?", "No, not even an administrator. The club sees only the total points. In a very small club, people may be able to guess."],
  ["What if I miss a deadline?", `You can still ${verb} and come to the meeting. An administrator can also give everyone more time before ${a} is chosen.`],
  ["I pressed the wrong thing. What now?", "Anything serious asks you to confirm first. You can change a nomination until nominations close, change your vote until voting closes, and change whether you are coming to a meeting at any time before it."],
  ["How do I get meetings into my calendar?", "Open Meetings and choose Add to my calendar. Pick Google, Apple or Outlook and confirm. After that, meetings appear and change by themselves."],
  ["What happens if I leave a club?", `${mine} stays with you. What you wrote for the club stays in its record.`],
] as const;

export default async function Help() {
  const { club } = await getViewer();
  const w = words(club?.kind);
  return (
    <>
      <PageHeader kicker="Commonplace" title="Help and guide" action={<Link className="btn btn-plain" href={club ? "/app" : "/onboarding"}>{club ? "Back to the club" : "Start or join a club"}</Link>}>Everything in plain words. You can also use “Help with this page” anywhere.</PageHeader>
      <Section title="How it works, from start to finish">
        <ol>
          {story(w).map(([title, body], i) => (
            <li key={title} className="row-sm grid grid-cols-[2.5rem_minmax(0,1fr)]">
              <span aria-hidden className="font-serif text-2xl text-rubric">{i + 1}</span>
              <div><h3 className="text-lg">{title}</h3><p className="max-w-prose text-soft">{body}</p></div>
            </li>
          ))}
        </ol>
      </Section>
      <Section title="Questions people ask">
        {faq(w).map(([q, answer]) => <Fold key={q} title={q}><p className="max-w-prose">{answer}</p></Fold>)}
      </Section>
      <Section title="What the words mean">
        <dl>
          {glossary(w).map(([term, meaning]) => (
            <div key={term} className="row-sm grid gap-x-6 sm:grid-cols-[11rem_minmax(0,1fr)]">
              <dt className="font-serif text-lg">{term}</dt><dd className="max-w-prose text-soft">{meaning}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </>
  );
}
