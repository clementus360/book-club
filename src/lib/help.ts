/** Help for each page: what it is for, and what you can do there. */
export type PageHelp = { title: string; about: string; todo: string[] };

const PAGES: [RegExp, PageHelp][] = [
  [/^\/app$/, { title: "Home", about: "Your club at a glance. The box at the top always says what to do next.", todo: ["Follow the button in the box at the top. If it says you are waiting, there is nothing you need to do.", "The four steps show how far the club has got with this book.", "If you belong to several clubs, open the menu beside the club’s name to switch."] }],
  [/^\/app\/selection/, { title: "Choosing a book", about: "This is where the club decides what to read. First everyone nominates one book, then everyone votes.", todo: ["While nominations are open, put forward one book. You can change it until they close.", "When voting opens, use the arrows to put the books in order, with your favourite first, then send your vote.", "Your vote is private. The club only ever sees the totals.", "Points: with three books, your first choice gets 3 points, your second 2 and your third 1. The most points wins.", "If there is a tie, there is a second vote between the tied books only."] }],
  [/^\/app\/current-book/, { title: "Our book", about: "The book your club is reading now, and everything to do with it.", todo: ["Say where you are: not started, reading or finished. It is only so others know.", "Add questions to talk about when you meet.", "Save passages and notes. Everyone in the club can read them.", "When the club has met, write a short review for the club’s record."] }],
  [/^\/app\/library/, { title: "Club shelf", about: "Every book connected with this club: read, nominated, recommended or simply added.", todo: ["Add a book you think belongs here. It does not enter it in the vote.", "Open a book to see its history with the club."] }],
  [/^\/app\/archive\/.+/, { title: "A book you have read", about: "Everything the club recorded about this book.", todo: ["See how it was chosen, when you met, and what people wrote.", "You can still add notes and a club review."] }],
  [/^\/app\/archive/, { title: "Books we have read", about: "Books this club has finished, newest first.", todo: ["Open one to see how it was chosen and what you said about it."] }],
  [/^\/app\/meetings\/(new|.+\/edit)/, { title: "Arranging a meeting", about: "Set when and where the club meets.", todo: ["A title, a date and a timezone are all you need. The rest can wait.", "Everyone is told when you save, and can say whether they are coming."] }],
  [/^\/app\/meetings\/.+/, { title: "A meeting", about: "The practical details, and who is coming.", todo: ["Tap Going, Maybe or Can’t make it. You can change your answer.", "Anyone can add notes. An administrator or the discussion leader writes up what happened."] }],
  [/^\/app\/meetings/, { title: "Meetings", about: "When and where the club meets.", todo: ["Open a meeting to see the details and say whether you are coming.", "Administrators can arrange new ones."] }],
  [/^\/app\/members/, { title: "Members", about: "Who is in the club.", todo: ["Any member can invite a friend. Each link lets in one person and lasts seven days.", "Administrators can also change roles and remove people."] }],
  [/^\/app\/my-library/, { title: "My books", about: "Your own private list. No club or member can see it, and it stays yours if you leave a club.", todo: ["Add books you have read, are reading or want to read.", "Open a book to rate it, review it or write notes.", "From there you can recommend it to one of your clubs, sharing only what you choose."] }],
  [/^\/app\/recommendations/, { title: "Recommendations", about: "Friendly suggestions between members. They are separate from the vote.", todo: ["See what others think your clubs would enjoy.", "To recommend something, open it in My books.", "To get a book into the vote, nominate it when nominations are open."] }],
  [/^\/app\/books\//, { title: "A book", about: "The book’s details, your private notes about it, and its history with your club.", todo: ["Add it to My books to rate or review it. Those stay private.", "Recommend it to a club, or nominate it when nominations are open."] }],
  [/^\/app\/add-book/, { title: "Finding a book", about: "Search two large book catalogues in any language.", todo: ["Just type. Results appear as you go.", "Pick the right book from the list. For a series, check the volume.", "If it is not there, enter it by hand."] }],
  [/^\/app\/account/, { title: "Your account", about: "Your own details. They are the same in every club, and changing them affects nobody else.", todo: ["Change the name and picture other members see.", "Change your password, or sign out.", "Looking for the club’s details? Open the menu beside the club’s name."] }],
  [/^\/app\/settings/, { title: "Club settings", about: "The club’s own details. Changes here affect everyone in it.", todo: ["Administrators can rename the club and set how long each step usually lasts.", "To manage people, open Members.", "Looking for your name or password? Open the menu beside your name."] }],
  [/^\/app\/notifications/, { title: "Notifications", about: "What has happened in your clubs.", todo: ["Select one to go straight to it."] }],
];

export const helpFor = (path: string): PageHelp =>
  PAGES.find(([p]) => p.test(path))?.[1] ?? { title: "Commonplace", about: "A private place for your book club.", todo: ["Open the full guide to see how everything works."] };

export const GLOSSARY: [string, string][] = [
  ["Club", "A private group of readers. Nobody outside can see it, and joining takes an invitation."],
  ["Administrator", "A member who looks after the club: they start choosing a book, arrange meetings and manage members. They cannot see private reviews or how anyone voted."],
  ["My books", "Your own private list of books, kept apart from every club."],
  ["Recommend", "Suggest a book to a club, any time. It does not enter the vote."],
  ["Nominate", "Put a book into the vote for what the club reads next. One each, while nominations are open."],
  ["Vote", "Put the nominated books in order of preference. The one with the most points is what the club reads."],
  ["Tie-break vote", "A second vote between books that came level."],
  ["Club shelf", "All the books connected with your club."],
  ["Private review", "A review in My books. Only you can read it."],
  ["Club review", "A review of a book the club read together. Everyone in the club can read it."],
];
