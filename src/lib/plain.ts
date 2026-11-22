/**
 * The database words a few of its messages more formally than the interface
 * does. Keyed by the exact text raised there; a test keeps the two in step.
 */
export const PLAIN: Record<string, string> = {
  "A ballot ranks every nominated book exactly once.": "Please put every book in order before you send your vote.",
  "Another reading cycle is under way. Finish that one first.": "The club is already on another book. Finish that one first.",
  "Only a completed cycle can be reopened.": "Only a finished book can be reopened.",
  "Only a cycle the club is reading can be completed.": "You can only finish a book the club is reading.",
  "That book has already been nominated for this cycle.": "Someone has already nominated that book. Try another.",
  "That reading cycle could not be found.": "That could not be found.",
  "This club already has a reading cycle under way. Complete it before starting another.": "The club is already on a book. Finish it before choosing another.",
  "This cycle is already finished.": "This has already finished.",
  "This cycle is finished, so its dates are fixed.": "This book is finished, so its dates cannot change.",
  "Voting can only be reopened when no ballots were cast.": "Voting can only be opened again if nobody voted.",
  "Voting is not open, so your ballot was not saved.": "Voting has closed, so your vote was not saved.",
  "You have already nominated a book for this cycle. Edit or withdraw that nomination first.": "You have already nominated a book. Change or withdraw that one first.",
};

export const plain = (message: string) => PLAIN[message] ?? message;
