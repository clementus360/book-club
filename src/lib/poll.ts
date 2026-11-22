import type { Enums } from "./database.types";

export type PollAnswer = Enums<"poll_answer">;
export const POLL_ANSWERS: readonly (readonly [PollAnswer, string])[] = [["yes", "Yes"], ["if_needed", "If needed"], ["no", "No"]];

export type TimeSummary = { id: string; starts_at: string; people: Record<PollAnswer, string[]>; best: boolean };
type Time = { id: string; starts_at: string };
type Answer = { time_id: string; user_id: string; answer: PollAnswer };

/** Times that suit most people first: fewest who cannot come, then most who freely can, then soonest. */
export function rankTimes(times: Time[], answers: Answer[], members: string[]): TimeSummary[] {
  const here = new Set(members);
  const list = times.map((t): TimeSummary => {
    const people: TimeSummary["people"] = { yes: [], if_needed: [], no: [] };
    for (const a of answers) if (a.time_id === t.id && here.has(a.user_id)) people[a.answer].push(a.user_id);
    return { id: t.id, starts_at: t.starts_at, people, best: false };
  });
  const can = (t: TimeSummary) => t.people.yes.length + t.people.if_needed.length;
  list.sort((a, b) => can(b) - can(a) || b.people.yes.length - a.people.yes.length || Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const top = list[0];
  if (top && can(top)) for (const t of list) t.best = can(t) === can(top) && t.people.yes.length === top.people.yes.length;
  return list;
}

/** Members who have answered for every one of these times. */
export const answeredAll = (times: Time[], answers: Answer[], members: string[]) =>
  members.filter((m) => times.every((t) => answers.some((a) => a.time_id === t.id && a.user_id === m)));
