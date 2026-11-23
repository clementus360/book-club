import type { Enums, Tables } from "./database.types";
import { cap, words, type Kind } from "./kinds";

export type Cycle = Tables<"reading_cycles">;
export type Status = Enums<"cycle_status">;

export const statusLabel = (kind: Kind | null | undefined): Record<Status, string> => {
  const w = words(kind);
  return {
    scheduled: `Choosing ${w.a} starts soon`,
    nominating: `Nominate ${w.a}`,
    nominations_closed: "Nominations have closed",
    voting: "Time to vote",
    runoff: "A tie-break vote",
    awaiting_decision: "A decision is needed",
    reading: w.progressing,
    completed: "Completed",
    cancelled: "Cancelled",
  };
};

/** Book-club labels, as they have always been. */
export const STATUS_LABEL = statusLabel("book");

export const METHOD_LABEL: Record<Enums<"decision_method">, string> = {
  vote: "Chosen by a club vote",
  runoff: "Chosen in a tie-break vote",
  admin_decision: "Decided by an administrator",
  sole_nomination: "The only nomination",
};

/** The deadline that matters now, if there is one. */
export function nextDeadline(c: Cycle, kind?: Kind | null): { label: string; at: string } | null {
  const doing = cap(words(kind).verbing);
  switch (c.status) {
    case "scheduled": return { label: "Nominations open", at: c.nomination_opens_at };
    case "nominating": return { label: "Nominations close", at: c.nomination_closes_at };
    case "nominations_closed": return new Date(c.voting_opens_at) > new Date() ? { label: "Voting opens", at: c.voting_opens_at } : null;
    case "voting": return { label: "Voting closes", at: c.voting_closes_at };
    case "runoff": return c.runoff_closes_at ? { label: "The tie-break closes", at: c.runoff_closes_at } : null;
    case "reading": return new Date(c.reading_starts_at) > new Date()
      ? { label: `${doing} begins`, at: c.reading_starts_at } : { label: `${doing} ends`, at: c.reading_ends_at };
    default: return null;
  }
}

export const isSelecting = (s: Status) => !["reading", "completed", "cancelled"].includes(s);
