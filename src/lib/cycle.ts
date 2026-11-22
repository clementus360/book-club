import type { Enums, Tables } from "./database.types";

export type Cycle = Tables<"reading_cycles">;
export type Status = Enums<"cycle_status">;

export const STATUS_LABEL: Record<Status, string> = {
  scheduled: "Choosing a book starts soon",
  nominating: "Nominate a book",
  nominations_closed: "Nominations have closed",
  voting: "Time to vote",
  runoff: "A tie-break vote",
  awaiting_decision: "A decision is needed",
  reading: "Reading",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const METHOD_LABEL: Record<Enums<"decision_method">, string> = {
  vote: "Chosen by a club vote",
  runoff: "Chosen in a tie-break vote",
  admin_decision: "Decided by an administrator",
  sole_nomination: "The only nomination",
};

/** The deadline that matters now, if there is one. */
export function nextDeadline(c: Cycle): { label: string; at: string } | null {
  switch (c.status) {
    case "scheduled": return { label: "Nominations open", at: c.nomination_opens_at };
    case "nominating": return { label: "Nominations close", at: c.nomination_closes_at };
    case "nominations_closed": return new Date(c.voting_opens_at) > new Date() ? { label: "Voting opens", at: c.voting_opens_at } : null;
    case "voting": return { label: "Voting closes", at: c.voting_closes_at };
    case "runoff": return c.runoff_closes_at ? { label: "The tie-break closes", at: c.runoff_closes_at } : null;
    case "reading": return new Date(c.reading_starts_at) > new Date()
      ? { label: "Reading begins", at: c.reading_starts_at } : { label: "Reading ends", at: c.reading_ends_at };
    default: return null;
  }
}

export const isSelecting = (s: Status) => !["reading", "completed", "cancelled"].includes(s);
