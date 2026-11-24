/**
 * What each control does, in a sentence, keyed by its visible label. Shown
 * before someone acts: on hover or keyboard focus, and, on touch screens, the
 * first time an action marked `acts` is tapped. tests/e2e/help.spec.ts fails if
 * a control on any page has no entry.
 */
export type Hint = { text: string; acts?: true };

import { cap, words, type Kind, type Words } from "./kinds";
import { BRAND } from "@/lib/brand";

const say = (text: string): Hint => ({ text });
const acts = (text: string): Hint => ({ text, acts: true });

/** The hints for one kind of club. Book clubs read exactly as they always have. */
function build(w: Words): Record<string, Hint> {
  const { one, many, a, verb } = w;
  return {
  // Getting around
  "Home": say("What is happening in your club, and what to do next."),
  [w.ours]: say(`The ${one} the club is choosing or ${w.verbing}.`),
  "Meetings": say("When and where the club meets, and who is coming."),
  "Club shelf": say(`Every ${one} this club has ${w.verbed}, nominated or been recommended.`),
  "Members": say("Who is in the club, and where to invite someone."),
  [w.mine]: say(`Your own private list of ${many}, reviews and notes.`),
  "Recommendations": say(`${cap(many)} members have suggested to each other, outside the vote.`),
  "Help and guide": say("How everything works, in plain words."),
  "Notifications": say("News from your clubs."),
  "Your account": say("Your name, picture and password. Only about you."),
  "Club settings": say("The club’s name, description and usual dates. Changes affect everyone."),
  "Sign out": acts("Signs you out on this device. Nothing is deleted."),
  "Start or join another club": say("Create a new club, or find out how to join a friend’s."),
  "Start or join a club": say("Create a new club, or find out how to join a friend’s."),
  "Help": say("Explains this page and everything you can do on it."),
  "Help with this page": say("Explains this page and everything you can do on it."),
  [w.pastShelf]: say(`Past ${many}, with how they were chosen and what you said about them.`),
  [`All club ${many}`]: say("Everything on the club’s shelf."),
  "Show older": say("Shows notifications from further back."),
  "Mark all as read": say("Clears the unread marks from your notifications."),

  // Inviting and members
  "Invite someone": say("Make a link that lets one friend join this club."),
  "Invite friends": say("Opens the members page, where you can make an invitation link."),
  "Make an invitation link": say("Creates a link for one person. It works for seven days."),
  "Make another link": say("Creates a separate link for another person."),
  "Copy": say("Copies the link so you can paste it into a message."),
  "Revoke": acts("Stops this invitation link from working."),
  "Make an administrator": acts(`Lets this person manage the club: members, meetings and choosing ${many}.`),
  "Make an ordinary member": acts("Takes away their administrator powers. They stay in the club."),
  "Remove": say("Removes this. You will be asked or shown what it affects."),
  "Leave club": say("Leaves this club. You will be asked to confirm."),

  // My list
  [`Add ${a}`]: say(`Search for ${a} to add.`),
  [`Add your first ${one}`]: say(`Search for ${a} to add to your private list.`),
  [`Add to ${w.mine.toLowerCase()}`]: say(`Puts this ${one} on your private list. Nobody else sees it.`),
  "Save review": say("Saves your rating and review. Only you can see them."),
  "Save entry": say("Saves your status, dates and notes. Only you can see them."),
  [`Remove from ${w.mine.toLowerCase()}`]: say(`Takes the ${one} off your list. You will be asked to confirm.`),
  "Recommend to club": say(`Suggest this ${one} to one of your clubs. This does not enter it in the vote.`),
  "Recommend": say("Shows your recommendation to the club you picked."),
  "Dates, notes and favourites": say(`Opens more private details about this ${one}.`),
  [`Edit ${one} details`]: say(`Correct the details of this ${one}, which you entered by hand.`),
  "Add another volume": say("Add a different volume of the same series as a separate book."),
  "Show everything": say(`Clears the filter and shows every ${one}.`),
  "Search": say("Search now."),

  // Adding something
  [`Enter the ${one} by hand`]: say("Type in the details yourself if search cannot find it."),
  "Continue": say("Checks the details and goes to the next step."),
  "Back to search": say("Returns to searching."),
  "Back": say("Returns to searching."),
  [`Choose a different ${one}`]: say(`Goes back so you can pick another ${one}.`),
  "No, mine is a different edition": say(`Adds your ${one} separately from the ones shown.`),
    "No, mine is a different one": say(`Adds your ${one} separately from the ones shown.`),
  "Add to the club shelf": say(`Shows this ${one} to the whole club. It does not enter it in the vote.`),
  "Remove from club shelf": acts(`Takes this ${one} off the club’s shelf.`),
  [`Open ${w.mine.toLowerCase()}`]: say(`Opens your private list of ${many}.`),
  [`Open ${w.mine}`]: say(`Opens your private list of ${many}.`),
  [`Go to ${w.mine}`]: say(`Opens your private list of ${many}.`),
  [`Add to ${w.mine}`]: say(`Puts this ${one} on your private list.`),
  "Withdraw": acts("Takes this back. You can do it again later."),
  "Edit": say("Change what you wrote."),

  // Choosing
  [`Start choosing ${a}`]: say(`Begins the process: everyone nominates ${a}, then you vote.`),
  "Start": say("Opens nominations now and tells everyone in the club."),
  [`Nominate ${a}`]: say(`Put forward one ${one} for the club to vote on.`),
  [`Nominate this ${one}`]: say(`Enters this ${one} in the club’s vote. You can change it until nominations close.`),
  "Change my nomination": say("Swaps your nomination for this one."),
  [`Change ${one}`]: say(`Pick a different ${one} to nominate.`),
  "See the nominations": say(`Shows every ${one} put forward so far.`),
  "Vote now": say(`Put the ${many} in the order you would like to ${verb} them.`),
  "Send my vote": say("Records your order. Nobody else can see it, and you can change it until voting closes."),
  "Update my vote": say("Replaces your earlier order with this one."),
  "See my vote": say("Shows the order you chose, so you can change it."),
  "Start the vote now": say("Closes nominations and opens voting. You will be asked to confirm."),
  "Count the votes now": say("Closes voting and shows the result. You will be asked to confirm."),
  "Give more time to nominate": say("Opens nominations again and clears any votes. You will be asked to confirm."),
  "Open voting again": say("Gives everyone another chance to vote. You will be asked to confirm."),
  "Change the dates": say("Move the deadlines."),
  [`Stop choosing this ${one}`]: say("Abandons this round so the club can start afresh. You will be asked to confirm."),
  [`Stop ${w.verbing} this ${one}`]: say(`Abandons this ${one} so the club can start afresh. You will be asked to confirm.`),
  "Record the decision": say(`Choose the winning ${one} and write down how you decided.`),
  "Decide what to do": say("Opens the choices for an administrator."),
  "Go and start the vote": say("Opens the page where you can start the vote."),
  "Go and count the votes": say("Opens the page where you can count the votes."),
  "See the result so far": say(`Shows the points each ${one} received.`),
  "For administrators": say("Opens controls that affect everyone in the club."),
  "Set exact dates instead": say("Pick the day and time of every deadline yourself."),
  "Use simple lengths instead": say("Go back to choosing how many days each step lasts."),

  // Reading, watching or playing
  "Update my progress": say(`Tells the club where you are in the ${one}. There is no race.`),
  "See how it was chosen": say(`Shows the votes that chose this ${one}.`),
  [`Back to the ${one}`]: say(`Opens the ${one} the club is ${w.verbing}.`),
  [`Finish this ${one}`]: say(`Moves it to ${w.pastShelf} so you can choose the next. You will be asked to confirm.`),
  [`Go and finish this ${one}`]: say(`Opens the page where you can finish this ${one}.`),
  [`Reopen this ${one}`]: say(`Makes this the club’s current ${one} again. You will be asked to confirm.`),
  "Add a question": say("Write something to talk about. Everyone in the club can read it."),
  "Add a quotation": say(w.kind === "book" ? "Save a passage from the book for the club." : `Save a line from the ${one} for the club.`),
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
  "Save name": say("Saves the name other members see."),
  "Save platforms": say("Saves what you play on, so your game clubs can see who could play what."),
  "Save goal": say("Sets where everyone should have got to by the meeting. Leave it empty to remove it."),
  "Use my Google picture": say("Shows the picture from your Google account. You can change it any time."),
  "Remove picture": say("Takes your picture away. Your initial is shown instead."),
  "Change password": say("Replaces your password."),
  "Change email address": acts("Sends a link to the new address. Your address changes when you follow it."),
  "New look": acts("Shows CommonPlace in its new colours and type, in this browser."),
  "Classic look": acts("Shows CommonPlace in its earlier look, in this browser."),
  "Download my data": acts("Downloads a copy of everything you have recorded, as a file you can keep."),
  "Delete my account": acts("Deletes your account and everything personal to it, for good. Your clubs are handed on or closed."),
  "Save email settings": say("Saves whether you are emailed at important moments."),
  "Stop these emails": say(`Turns off emails from ${BRAND.name}. The app keeps working as before.`),
  "Save club settings": say("Saves these details for the whole club."),
  "Close the club": say("Permanently deletes this club. You will be asked to confirm."),
  "Create the club": say("Creates a private club with you as its administrator."),
  "Back to the club": say("Returns to your club’s home."),
  "Read the full guide": say("Opens the guide, with everything explained in order."),
  "More": say("Shows everything else in the menu."),
  "More details": say("Shows optional details."),
  };
}

const patterns = (w: Words, hints: Record<string, Hint>): [RegExp, Hint][] => [
  [/^Move .+ up$/, say(`Moves this ${w.one} one place higher in your order.`)],
  [/^Move .+ down$/, say(`Moves this ${w.one} one place lower in your order.`)],
  [/^Nominate for /, say(`Enters this ${w.one} in the club’s vote.`)],
  [new RegExp(`^${cap(w.verb)} `), acts(`Makes this the club’s ${w.one}, since it was the only one nominated.`)],
  [/^Notifications/, hints["Notifications"]!],

  [/^More\b/, hints["More"]!],
  [/^Copied/, hints["Copy"]!],
];

const BUILT = new Map<Kind, { hints: Record<string, Hint>; patterns: [RegExp, Hint][] }>();
function forKind(kind: Kind) {
  let made = BUILT.get(kind);
  if (!made) {
    const hints = build(words(kind));
    made = { hints, patterns: patterns(words(kind), hints) };
    BUILT.set(kind, made);
  }
  return made;
}

/** Book-club hints, for code and tests that do not depend on a kind. */
export const HINTS = forKind("book").hints;

export function hintFor(label: string, kind: Kind = "book"): Hint | null {
  const key = label.replace(/\s+/g, " ").replace(/ \(your answer\)$/, "").trim();
  const { hints, patterns: found } = forKind(kind);
  if (Object.hasOwn(hints, key)) return hints[key]!;
  return found.find(([p]) => p.test(key))?.[1] ?? null;
}
