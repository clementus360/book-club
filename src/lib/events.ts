/** Activity and notifications share one vocabulary; neither carries any prose. */
type Event = { type: string; reference_id: string | null; actor: string; book?: string | null; meeting?: string | null; finished?: boolean };

export function describeEvent({ type, reference_id, actor, book, meeting, finished }: Event): { text: string; href: string } {
  const title = book ? ` ${book}` : " a book";
  const called = meeting ? `: ${meeting}` : "";
  const map: Record<string, [string, string]> = {
    club_created: [`${actor} started the club`, "/app/members"],
    member_joined: [`${actor} joined the club`, "/app/members"],
    member_left: [`${actor} is no longer in the club`, "/app/members"],
    book_added: [`${actor} added${title} to the club shelf`, "/app/library"],
    recommendation_shared: [`${actor} recommended${title}`, "/app/recommendations"],
    book_nominated: [`${actor} nominated${title}`, "/app/selection"],
    nominations_opened: ["Nominations opened", "/app/selection"],
    nominations_closed: ["Nominations closed", "/app/selection"],
    nominations_reopened: [`${actor} reopened nominations`, "/app/selection"],
    voting_opened: ["Voting opened", "/app/selection"],
    voting_opened_early: [`${actor} opened voting early`, "/app/selection"],
    voting_closed_early: [`${actor} closed voting early`, "/app/selection"],
    voting_reopened: [`${actor} reopened voting`, "/app/selection"],
    runoff_opened: ["The vote was tied, so a tie-break vote opened", "/app/selection"],
    decision_needed: ["The vote did not settle it. An administrator needs to decide", "/app/selection"],
    book_selected: [book ? `${book} was chosen` : "A book was chosen", "/app/current-book"],
    cycle_completed: [book ? `The club finished ${book}` : "The club finished a book", reference_id ? `/app/archive/${reference_id}` : "/app/archive"],
    cycle_reopened: [`${actor} reopened a finished book`, "/app/current-book"],
    cycle_cancelled: [`${actor} stopped choosing a book`, "/app/selection"],
    poll_opened: [`${actor} asked when you can meet${called}`, `/app/meetings/find/${reference_id}`],
    poll_time_added: [`${actor} suggested another time${called}`, `/app/meetings/find/${reference_id}`],
    meeting_created: [`${actor} arranged a meeting${called}`, `/app/meetings/${reference_id}`],
    meeting_updated: [`${actor} changed a meeting${called}`, `/app/meetings/${reference_id}`],
    meeting_cancelled: [`${actor} cancelled a meeting${called}`, `/app/meetings/${reference_id}`],
  };
  const [text, href] = map[type] ?? ["Something changed in the club", "/app"];
  // Once the book is finished, how it was chosen is kept in the archive.
  const past = finished && reference_id && (href === "/app/selection" || href === "/app/current-book");
  return { text, href: past ? `/app/archive/${reference_id}` : href };
}
