import { authorsOf } from "@/components/book-line";
import { nameOf } from "@/components/ui";
import { METHOD_LABEL, type Cycle } from "@/lib/cycle";
import type { Nomination } from "@/lib/data/club";
import type { Tables } from "@/lib/database.types";
import { cap, words, type Kind } from "@/lib/kinds";

/** How the club chose: scores and participation, never anyone's ballot. */
export function Results({ cycle, nominations, rounds, results, decider, kind = "book" }: {
  cycle: Cycle; nominations: Nomination[]; rounds: Tables<"vote_rounds">[]; results: Tables<"vote_results">[]; decider?: string | null; kind?: Kind;
}) {
  const w = words(kind);
  const byId = new Map(nominations.map((n) => [n.id, n]));
  return (
    <div>
      {rounds.map((round) => {
        const rows = results.filter((r) => r.round === round.round);
        const tied = rows.filter((r) => r.is_top).length > 1;
        return (
          <div key={round.round} className="mb-8 last:mb-0">
            <table className="w-full text-left">
              <caption className="mb-3 text-left">
                <span className="font-serif text-lg">{round.round === 1 ? "The vote" : "The tie-break vote"}</span>
                <span className="meta block">{round.ballots_cast} of {round.eligible_voters} members voted{tied ? `. The top ${w.many} were tied.` : "."}</span>
              </caption>
              <thead className="sr-only"><tr><th scope="col">{cap(w.one)}</th><th scope="col">Points</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const n = byId.get(r.nomination_id);
                  return (
                    <tr key={r.nomination_id} className="border-t border-rule">
                      <td className="py-4 pr-4">
                        <span className={`font-serif ${n?.book_id === cycle.book_id ? "text-lg" : ""}`}>{n?.book.title ?? `A withdrawn ${w.one}`}</span>
                        {n?.book_id === cycle.book_id && cycle.book_id && <span className="rubric ml-2">chosen</span>}
                        <span className="meta block">{n && `${authorsOf(n.book) ? `${authorsOf(n.book)}. ` : ""}Nominated by ${nameOf(n.nominator)}.`}</span>
                      </td>
                      <td className="py-4 text-right align-top font-serif text-lg whitespace-nowrap">{r.score} <span className="meta">{r.score === 1 ? "point" : "points"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      {cycle.decision_method && (
        <div className="notice mt-5">
          <p>{METHOD_LABEL[cycle.decision_method]}{decider && cycle.decision_method === "admin_decision" ? `: ${decider}` : ""}</p>
          {cycle.decision_reason && <p className="mt-1 font-serif">{cycle.decision_reason}</p>}
        </div>
      )}
      {rounds.length > 0 && <p className="hint">{`How points work: with three ${w.many}, each person’s first choice gets 3 points, their second 2 and their third 1.`}</p>}
    </div>
  );
}
