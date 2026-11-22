/**
 * What each control does, in a sentence, keyed by its visible label. Shown
 * before someone acts: on hover or keyboard focus, and, on touch screens, the
 * first time an action marked `acts` is tapped. tests/e2e/help.spec.ts fails if
 * a control on any page has no entry.
 */
export type Hint = { text: string; acts?: true };

const say = (text: string): Hint => ({ text });
const acts = (text: string): Hint => ({ text, acts: true });

export const HINTS: Record<string, Hint> = {
  // Getting around
  "Home": say("What is happening in your club, and what to do next."),
  "Our book": say("The book the club is choosing or reading."),
  "Meetings": say("When and where the club meets, and who is coming."),
  "Club shelf": say("Every book this club has read, nominated or been recommended."),
  "Members": say("Who is in the club, and where to invite someone."),
  "My books": say("Your own private list of books, reviews and notes."),
  "Recommendations": say("Books members have suggested to each other, outside the vote."),
  "Help and guide": say("How everything works, in plain words."),
  "Notifications": say("News from your clubs."),
  "Your account": say("Your name, picture and password. Only about you."),
  "Club settings": say("The club’s name, description and usual dates. Changes affect everyone."),
  "Sign out": acts("Signs you out on this device. Nothing is deleted."),
  "Start or join another club": say("Create a new club, or find out how to join a friend’s."),
  "Start or join a club": say("Create a new club, or find out how to join a friend’s."),
  "Help": say("Explains this page and everything you can do on it."),
  "Help with this page": say("Explains this page and everything you can do on it."),
  "Books we have read": say("Past books, with how they were chosen and what you said about them."),
  "All club books": say("Everything on the club’s shelf."),
  "Show older": say("Shows notifications from further back."),
  "Mark all as read": say("Clears the unread marks from your notifications."),

  // Inviting and members
  "Invite someone": say("Make a link that lets one friend join this club."),
  "Invite friends": say("Opens the members page, where you can make an invitation link."),
  "Make an invitation link": say("Creates a link for one person. It works for seven days."),
  "Make another link": say("Creates a separate link for another person."),
  "Copy": say("Copies the link so you can paste it into a message."),
  "Revoke": acts("Stops this invitation link from working."),
  "Make an administrator": acts("Lets this person manage the club: members, meetings and choosing books."),
  "Make an ordinary member": acts("Takes away their administrator powers. They stay in the club."),
  "Remove": say("Removes this. You will be asked or shown what it affects."),
  "Leave club": say("Leaves this club. You will be asked to confirm."),

  // My books
  "Add a book": say("Search for a book to add."),
  "Add your first book": say("Search for a book to add to your private list."),
  "Add to my books": say("Puts this book on your private list. Nobody else sees it."),
  "Save review": say("Saves your rating and review. Only you can see them."),
  "Save entry": say("Saves your status, dates and notes. Only you can see them."),
  "Remove from my books": say("Takes the book off your list. You will be asked to confirm."),
  "Recommend to club": say("Suggest this book to one of your clubs. This does not enter it in the vote."),
  "Recommend": say("Shows your recommendation to the club you picked."),
  "Dates, notes and favourites": say("Opens more private details about this book."),
  "Edit book details": say("Correct the details of this book, which you entered by hand."),
  "Add another volume": say("Add a different volume of the same series as a separate book."),
  "Show everything": say("Clears the filter and shows every book."),
  "Search": say("Search now."),

  // Adding a book
  "Enter the book by hand": say("Type in the details yourself if search cannot find it."),
  "Continue": say("Checks the details and goes to the next step."),
  "Back to search": say("Returns to searching."),
  "Back": say("Returns to searching."),
  "Choose a different book": say("Goes back so you can pick another book."),
  "No, mine is a different edition": say("Adds your book separately from the ones shown."),
  "Add to the club shelf": say("Shows this book to the whole club. It does not enter it in the vote."),
  "Remove from club shelf": acts("Takes this book off the club’s shelf."),
  "Open my books": say("Opens your private list of books."),
  "Open My books": say("Opens your private list of books."),
  "Go to My books": say("Opens your private list of books."),
  "Add to My books": say("Puts this book on your private list."),
  "Withdraw": acts("Takes this back. You can do it again later."),
  "Edit": say("Change what you wrote."),

  // Choosing a book
  "Start choosing a book": say("Begins the process: everyone nominates a book, then you vote."),
  "Start": say("Opens nominations now and tells everyone in the club."),
  "Nominate a book": say("Put forward one book for the club to vote on."),
  "Nominate this book": say("Enters this book in the club’s vote. You can change it until nominations close."),
  "Change my nomination": say("Swaps your nomination for this one."),
  "Change book": say("Pick a different book to nominate."),
  "See the nominations": say("Shows every book put forward so far."),
  "Vote now": say("Put the books in the order you would like to read them."),
  "Send my vote": say("Records your order. Nobody else can see it, and you can change it until voting closes."),
  "Update my vote": say("Replaces your earlier order with this one."),
  "See my vote": say("Shows the order you chose, so you can change it."),
  "Start the vote now": say("Closes nominations and opens voting. You will be asked to confirm."),
  "Count the votes now": say("Closes voting and shows the result. You will be asked to confirm."),
  "Give more time to nominate": say("Opens nominations again and clears any votes. You will be asked to confirm."),
  "Open voting again": say("Gives everyone another chance to vote. You will be asked to confirm."),
  "Change the dates": say("Move the deadlines."),
  "Stop choosing this book": say("Abandons this round so the club can start afresh. You will be asked to confirm."),
  "Stop reading this book": say("Abandons this book so the club can start afresh. You will be asked to confirm."),
  "Record the decision": say("Choose the winning book and write down how you decided."),
  "Decide what to do": say("Opens the choices for an administrator."),
  "Go and start the vote": say("Opens the page where you can start the vote."),
  "Go and count the votes": say("Opens the page where you can count the votes."),
  "See the result so far": say("Shows the points each book received."),
  "For administrators": say("Opens controls that affect everyone in the club."),
  "Set exact dates instead": say("Pick the day and time of every deadline yourself."),
  "Use simple lengths instead": say("Go back to choosing how many days each step lasts."),

  // Reading
  "Update my progress": say("Tells the club where you are in the book. There is no race."),
  "See how it was chosen": say("Shows the votes that chose this book."),
  "Back to the book": say("Opens the book the club is reading."),
  "Finish this book": say("Moves it to Books we have read so you can choose the next. You will be asked to confirm."),
  "Go and finish this book": say("Opens the page where you can finish this book."),
  "Reopen this book": say("Makes this the club’s current book again. You will be asked to confirm."),
  "Add a question": say("Write something to talk about. Everyone in the club can read it."),
  "Add a quotation": say("Save a passage from the book for the club."),
  "Add a note": say("Write a thought for the whole club to read."),
  "Write a club review": say("Say what you thought, for everyone in the club to read."),
  "Edit my club review": say("Change the review the club can read."),

  // Meetings
  "Arrange a meeting": say("Set a date, a time and a place."),
  "Find a date": say("Suggest a few times and ask everyone which suit them."),
  "Ask everyone": say("Tells everyone in the club, so they can say which times suit them."),
  "Add another time": say("Adds a box for one more time."),
  "Send my answers": say("Tells the club which times suit you. You can change this until a time is chosen."),
  "Update my answers": say("Replaces your earlier answers."),
  "Say when you can come": say("Opens the suggested times so you can answer."),
  "See the answers": say("Shows which times suit most people."),
  "Suggest another time": say("Adds a time and asks everyone about it."),
  "Choose this time": say("Arranges the meeting at this time. You will be asked to confirm."),
  "Stop looking for a date": say("Calls off the search without arranging a meeting. You will be asked to confirm."),
  "Add to calendar": say("Puts this meeting in the calendar you use. Nothing to download."),
  "Add to my calendar": say("Shows all your meetings in the calendar you use, and keeps them up to date."),
  "Google Calendar": say("Opens Google Calendar, which asks you to confirm."),
  "Apple Calendar": say("Opens the Calendar app on your iPhone, iPad or Mac, which asks you to confirm."),
  "Outlook.com": say("Opens your personal Outlook calendar, which asks you to confirm."),
  "Outlook for work or school": say("Opens your work or school Outlook calendar, which asks you to confirm."),
  "Show my private link": say("Shows a link you can paste into any calendar app."),
  "Turn off my calendar link": say("Stops your calendars updating. You will be asked to confirm."),
  "Arrange the meeting": say("Saves the meeting and tells everyone in the club."),
  "Going": acts("Tells the club you are coming."),
  "Maybe": acts("Tells the club you might come."),
  "Can’t make it": acts("Tells the club you are not coming."),
  "Answer": say("Opens the meeting so you can say whether you are coming."),
  "Edit meeting": say("Change the date, place or other details."),
  "Cancel meeting": say("Calls off the meeting. You will be asked to confirm."),
  "Restore meeting": acts("Puts the cancelled meeting back on."),
  "Mark as still to come": acts("Says this meeting has not happened yet."),
  "Save the record": say("Saves what came of the meeting for everyone in the club."),
  "Save changes": say("Saves the meeting. If the date or place changed, everyone is told."),
  "Write up this meeting": say("Opens a box to record what was said and decided."),

  // Settings and help
  "Save profile": say("Saves the name and picture other members see."),
  "Change password": say("Replaces your password."),
  "Save club settings": say("Saves these details for the whole club."),
  "Close the club": say("Permanently deletes this club. You will be asked to confirm."),
  "Create the club": say("Creates a private club with you as its administrator."),
  "Back to the club": say("Returns to your club’s home."),
  "Read the full guide": say("Opens the guide, with everything explained in order."),
  "More": say("Shows everything else in the menu."),
  "More details": say("Shows optional details."),
};

const PATTERNS: [RegExp, Hint][] = [
  [/^Move .+ up$/, say("Moves this book one place higher in your order.")],
  [/^Move .+ down$/, say("Moves this book one place lower in your order.")],
  [/^Nominate for /, say("Enters this book in the club’s vote.")],
  [/^Read /, acts("Makes this the club’s book, since it was the only one nominated.")],
  [/^Notifications/, HINTS["Notifications"]!],

  [/^More\b/, HINTS["More"]!],
  [/^Copied/, HINTS["Copy"]!],
];

export function hintFor(label: string): Hint | null {
  const key = label.replace(/\s+/g, " ").replace(/ \(your answer\)$/, "").trim();
  if (Object.hasOwn(HINTS, key)) return HINTS[key]!;
  return PATTERNS.find(([p]) => p.test(key))?.[1] ?? null;
}
