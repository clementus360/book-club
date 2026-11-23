import { cap, words, type Kind, type Words } from "./kinds";

/** Help for each page: what it is for, and what you can do there. */
export type PageHelp = { title: string; about: string; todo: string[] };

const pages = (w: Words): [RegExp, PageHelp][] => {
  const { one, many, a, verb, verbing, verbed } = w;
  return [
  [/^\/app$/, { title: "Home", about: "Your club at a glance. The box at the top always says what to do next.", todo: ["Follow the button in the box at the top. If it says you are waiting, there is nothing you need to do.", `The four steps show how far the club has got with this ${one}.`, "If you belong to several clubs, open the menu beside the club’s name to switch."] }],
  [/^\/app\/selection/, { title: `Choosing ${a}`, about: `This is where the club decides what to ${verb}. First everyone nominates one ${one}, then everyone votes.`, todo: [`While nominations are open, put forward one ${one}. You can change it until they close.`, `When voting opens, use the arrows to put the ${many} in order, with your favourite first, then send your vote.`, "Your vote is private. The club only ever sees the totals.", `Points: with three ${many}, your first choice gets 3 points, your second 2 and your third 1. The most points wins.`, `If there is a tie, there is a second vote between the tied ${many} only.`] }],
  [/^\/app\/current-book/, { title: w.ours, about: `The ${one} your club is ${verbing} now, and everything to do with it.`, todo: [`Say where you are: not started, ${verbing} or finished. It is only so others know.`, "Add questions to talk about when you meet.", w.kind === "book" ? "Save passages and notes. Everyone in the club can read them." : "Save quotations and notes. Everyone in the club can read them.", "When the club has met, write a short review for the club’s record."] }],
  [/^\/app\/library/, { title: "Club shelf", about: `Every ${one} connected with this club: ${verbed}, nominated, recommended or simply added.`, todo: [`Add ${a} you think belongs here. It does not enter it in the vote.`, `Open ${a} to see its history with the club.`] }],
  [/^\/app\/archive\/.+/, { title: `${cap(a)} you have ${verbed}`, about: `Everything the club recorded about this ${one}.`, todo: ["See how it was chosen, when you met, and what people wrote.", "You can still add notes and a club review."] }],
  [/^\/app\/archive/, { title: w.pastShelf, about: `${cap(many)} this club has finished, newest first.`, todo: ["Open one to see how it was chosen and what you said about it."] }],
  [/^\/app\/meetings\/find$/, { title: "Finding a date", about: "Ask everyone which times suit them before you arrange a meeting.", todo: ["Suggest at least two times.", "Everyone is told, and says yes, if needed or no to each.", "Choose the best one and the meeting is arranged for you."] }],
  [/^\/app\/meetings\/find\//, { title: "Finding a date", about: "Say which of the suggested times suit you.", todo: ["Answer for every time, then send your answers. You can change them until a time is chosen.", "Everyone in the club can see who can come when.", "An administrator chooses the time. Your answer to it becomes your answer to the meeting, and you can change that too."] }],
  [/^\/app\/calendar/, { title: "Your calendar", about: "See your meetings in the calendar you already use.", todo: ["Choose your calendar and confirm when it asks. You only do this once.", "Changes and cancellations follow by themselves, though your calendar may take up to a day to notice.", "The link is private to you. Turn it off here if someone else gets it."] }],
  [/^\/app\/meetings\/(new|.+\/edit)/, { title: "Arranging a meeting", about: "Set when and where the club meets.", todo: ["A title, a date and a timezone are all you need. The rest can wait.", "Everyone is told when you save, and can say whether they are coming."] }],
  [/^\/app\/meetings\/.+/, { title: "A meeting", about: "The practical details, and who is coming.", todo: ["Tap Going, Maybe or Can’t make it. You can change your answer.", "Add to calendar puts it in the calendar you use.", "Anyone can add notes. An administrator or the discussion leader writes up what happened."] }],
  [/^\/app\/meetings/, { title: "Meetings", about: "When and where the club meets.", todo: ["Open a meeting to see the details and say whether you are coming.", "Administrators can arrange new ones, or ask everyone which times suit them.", "Add to my calendar keeps all your meetings in the calendar you use."] }],
  [/^\/app\/members/, { title: "Members", about: "Who is in the club.", todo: ["Any member can invite a friend. Each link lets in one person and lasts seven days.", "Administrators can also change roles and remove people."] }],
  [/^\/app\/my-library/, { title: w.mine, about: "Your own private list. No club or member can see it, and it stays yours if you leave a club.", todo: [`Add ${many} you have ${verbed}, are ${verbing} or want to ${verb}.`, `Open ${a} to rate it, review it or write notes.`, "From there you can recommend it to one of your clubs, sharing only what you choose."] }],
  [/^\/app\/recommendations/, { title: "Recommendations", about: "Friendly suggestions between members. They are separate from the vote.", todo: ["See what others think your clubs would enjoy.", `To recommend something, open it in ${w.mine}.`, `To get ${a} into the vote, nominate it when nominations are open.`] }],
  [/^\/app\/books\//, { title: cap(a), about: `The ${one}’s details, your private notes about it, and its history with your club.`, todo: [`Add it to ${w.mine} to rate or review it. Those stay private.`, "Recommend it to a club, or nominate it when nominations are open."] }],
  [/^\/app\/add-book/, { title: `Finding ${a}`, about: w.kind === "book" ? "Search two large book catalogues in any language." : `Search ${w.source}, in any language.`, todo: ["Just type. Results appear as you go.", w.kind === "book" ? "Pick the right book from the list. For a series, check the volume." : `Pick the right ${one} from the list. Check the year if there are several with the same name.`, "If it is not there, enter it by hand."] }],
  [/^\/app\/account/, { title: "Your account", about: "Your own details. They are the same in every club, and changing them affects nobody else.", todo: ["Change the name and picture other members see.", "Change your password, or sign out.", "Choose whether you are emailed at important moments.", "Looking for the club’s details? Open the menu beside the club’s name."] }],
  [/^\/app\/settings/, { title: "Club settings", about: "The club’s own details. Changes here affect everyone in it.", todo: ["Administrators can rename the club and set how long each step usually lasts.", "To manage people, open Members.", "Looking for your name or password? Open the menu beside your name."] }],
  [/^\/app\/notifications/, { title: "Notifications", about: "What has happened in your clubs.", todo: ["Select one to go straight to it. That marks it as read.", "Use Mark as read to clear one without opening it, or Mark all as read to clear them all."] }],
];
};

export const helpFor = (path: string, kind: Kind = "book"): PageHelp =>
  pages(words(kind)).find(([p]) => p.test(path))?.[1] ?? { title: "Commonplace", about: `A private place for your ${words(kind).club}.`, todo: ["Open the full guide to see how everything works."] };

export const glossary = ({ kind, many, a, verbs, verbed, mine }: Words): [string, string][] => [
  ["Club", `A private group of ${kind === "book" ? "readers" : "friends"}. Nobody outside can see it, and joining takes an invitation.`],
  ["Administrator", `A member who looks after the club: they start choosing ${a}, arrange meetings and manage members. They cannot see private reviews or how anyone voted.`],
  [mine, `Your own private list of ${many}, kept apart from every club.`],
  ["Recommend", `Suggest ${a} to a club, any time. It does not enter the vote.`],
  ["Nominate", `Put ${a} into the vote for what the club ${verbs} next. One each, while nominations are open.`],
  ["Vote", `Put the nominated ${many} in order of preference. The one with the most points is what the club ${verbs}.`],
  ["Tie-break vote", `A second vote between ${many} that came level.`],
  ["Club shelf", `All the ${many} connected with your club.`],
  ["Private review", `A review in ${mine}. Only you can read it.`],
  ["Club review", `A review of ${a} the club ${verbed} together. Everyone in the club can read it.`],
];
