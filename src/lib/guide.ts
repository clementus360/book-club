import type { Status } from "./cycle";
import { fromNow } from "./dates";
import { cap, describeKind, words, type Kind } from "./kinds";

export const steps = (kind: Kind) => {
  const { one, many, verb, verbs } = words(kind);
  return [
    { name: "Nominate", what: `Each member puts forward one ${one}.` },
    { name: "Vote", what: `Everyone puts the ${many} in order. The favourite wins.` },
    { name: cap(verb), what: `The club ${verbs} the winning ${one}.` },
    { name: "Meet", what: "You meet, talk about it, and start again." },
  ];
};

export type GuideInput = {
  kind?: Kind;
  status: Status | null;
  isAdmin: boolean;
  members: number;
  everRead: boolean;
  nominations: number;
  iNominated: boolean;
  votes: number;
  iVoted: boolean;
  deadline: { label: string; at: string } | null;
  myProgress: "not_started" | "reading" | "finished" | null;
  /** The next meeting still to come, if any. */
  meeting: { id: string; title: string; answered: boolean; startsAt: string } | null;
  /** A meeting about this book has already been held. */
  met: boolean;
  iReviewed: boolean;
  /** A date being looked for, if any. */
  poll?: { id: string; answered: boolean; everyone: boolean } | null;
};

export type NextStep = { title: string; body: string; action?: { label: string; href: string }; waiting?: boolean };

/** Which of the four steps the club is on, or null when it is between books. */
export function stepOf(status: Status | null, met: boolean): number | null {
  switch (status) {
    case "scheduled": case "nominating": case "nominations_closed": return 0;
    case "voting": case "runoff": case "awaiting_decision": return 1;
    case "reading": return met ? 3 : 2;
    default: return null;
  }
}

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** The single most useful thing this person could do now, in plain words. */
export function nextStep(g: GuideInput): NextStep {
  const when = g.deadline ? ` ${g.deadline.label} ${fromNow(g.deadline.at)}.` : "";
  const w = words(g.kind);
  const { one, many, a, verb } = w;

  switch (g.status) {
    case null: case "completed": case "cancelled":
      if (g.members < 2) return { title: "Invite your friends", body: `${describeKind(w.kind)} needs company. Make a link for each friend and send it to them. They join as soon as they open it.`, action: { label: "Invite friends", href: "/app/members" } };
      if (g.isAdmin) return { title: g.everRead ? `Choose your next ${one}` : `Choose your first ${one}`, body: `When you start, everyone gets a few days to put forward one ${one} each. Then you all vote.`, action: { label: `Start choosing ${a}`, href: "/app/selection" } };
      return { title: "Nothing to do just now", body: `The club is between ${many}. An administrator will start choosing the next one, and you will be told here. Meanwhile, add ${many} you have ${w.verbed} to ${w.mine}.`, action: { label: `Go to ${w.mine}`, href: "/app/my-library" }, waiting: true };

    case "scheduled":
      return { title: "Choosing starts soon", body: `There is nothing to do yet.${when} Have a think about ${a} you would like the club to ${verb}.`, waiting: true };

    case "nominating":
      if (!g.iNominated) return { title: `Nominate ${a}`, body: `Put forward one ${one} you would like the club to ${verb}. Later, everyone votes between the nominations.${when}`, action: { label: `Nominate ${a}`, href: "/app/add-book?to=nominate" } };
      if (g.isAdmin && g.nominations >= 2 && g.nominations >= g.members) return { title: "Everyone has nominated", body: "You do not have to wait for the deadline. You can start the vote now.", action: { label: "Go and start the vote", href: "/app/selection#manage" } };
      return { title: "You have nominated. Now wait for the others", body: `${g.nominations} of ${people(g.members)} have nominated so far. Voting comes next.${when}`, action: { label: "See the nominations", href: "/app/selection" }, waiting: true };

    case "nominations_closed":
      if (g.nominations >= 2) return { title: "Voting is next", body: `Nominations are in.${when}`, action: { label: "See the nominations", href: "/app/selection" }, waiting: true };
      return g.isAdmin
        ? { title: "The club needs you to decide", body: g.nominations ? `Only one ${one} was nominated, so there is nothing to vote on. You can ${verb} that ${one}, or give everyone more time.` : `Nobody nominated ${a}. You can give everyone more time.`, action: { label: "Decide what to do", href: "/app/selection" } }
        : { title: "Waiting for an administrator", body: g.nominations ? `Only one ${one} was nominated. An administrator will decide what happens next.` : `No ${many} were nominated. An administrator can give everyone more time.`, waiting: true };

    case "voting": case "runoff":
      if (!g.iVoted) return { title: g.status === "runoff" ? "Vote again to break the tie" : `Vote for the next ${one}`, body: `Put the ${many} in order, with the one you most want to ${verb} at the top. Nobody can see how you voted.${when}`, action: { label: "Vote now", href: "/app/selection#vote" } };
      if (g.isAdmin && g.votes >= g.members) return { title: "Everyone has voted", body: "You do not have to wait for the deadline. You can count the votes now.", action: { label: "Go and count the votes", href: "/app/selection#manage" } };
      return { title: "You have voted. Now wait for the others", body: `${g.votes} of ${people(g.members)} have voted. You can still change your vote.${when}`, action: { label: "See my vote", href: "/app/selection#vote" }, waiting: true };

    case "awaiting_decision":
      return g.isAdmin
        ? { title: "The club needs you to decide", body: `The vote did not produce a winner. Agree on ${a} together, then record it here.`, action: { label: "Record the decision", href: "/app/selection" } }
        : { title: "Waiting for a decision", body: "The vote did not produce a winner, so an administrator will settle it with the group.", action: { label: "See the result so far", href: "/app/selection" }, waiting: true };

    case "reading":
      if (g.poll && !g.poll.answered) return { title: "When can you meet?", body: "The club is looking for a date. Say which of the suggested times suit you.", action: { label: "Say when you can come", href: `/app/meetings/find/${g.poll.id}` } };
      if (g.poll?.everyone && g.isAdmin) return { title: "Everyone has answered", body: "See which time suits most people, and choose it.", action: { label: "See the answers", href: `/app/meetings/find/${g.poll.id}` } };
      if (g.meeting && !g.meeting.answered) return { title: "Are you coming to the meeting?", body: `${g.meeting.title} is ${fromNow(g.meeting.startsAt)}. Let the others know if you can make it.`, action: { label: "Answer", href: `/app/meetings/${g.meeting.id}` } };
      if (g.met && !g.iReviewed) return { title: "Say what you thought", body: `The club has met about this ${one}. Leave a few words for the club’s record.`, action: { label: "Write a club review", href: "/app/current-book#reviews" } };
      if (g.met && g.isAdmin && !g.meeting && !g.poll) return { title: `Finish this ${one} when you are ready`, body: `The club has met. Finishing moves the ${one} and everything you wrote to ${w.pastShelf}, and lets you choose the next one.`, action: { label: `Go and finish this ${one}`, href: "/app/current-book#manage" } };
      if (g.isAdmin && !g.meeting && !g.met && !g.poll) return { title: "Arrange a meeting", body: `Pick a date and a place to talk about the ${one}. Not sure when? Find a date, on the Meetings page, asks everyone what suits them.`, action: { label: "Arrange a meeting", href: "/app/meetings/new" } };
      if (g.myProgress === "finished") return { title: `You have finished the ${one}`, body: g.meeting ? `The meeting is ${fromNow(g.meeting.startsAt)}. Until then, you could add a question to talk about.` : "You could add a question to talk about when you meet.", action: { label: "Add a question", href: "/app/current-book#questions" }, waiting: true };
      return { title: `Enjoy the ${one}`, body: `${cap(verb)} at your own pace, and let the others know where you are.${when}`, action: { label: "Update my progress", href: "/app/current-book#progress" } };
  }
}
