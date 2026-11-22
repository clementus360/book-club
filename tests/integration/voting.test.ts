import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Harness } from "../support/harness";

let h: Harness;
beforeAll(async () => { h = await Harness.create("voting"); });
afterAll(() => h.end());

const ballot = (who: string, cycle: string, ranking: unknown) => h.rpc(who, "submit_ballot", { p_cycle_id: cycle, p_ranking: ranking });
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

describe("cycles", () => {
  it("are started by administrators, one at a time, with dates in order", async () => {
    const [a, b] = [await h.user(), await h.user()];
    const club = await h.club(a);
    await h.join(a, club, b);
    await expect(h.cycle(b, club)).rejects.toThrow(/Only a club administrator/);
    await expect(h.cycle(a, club, [0, 5, 3, 8, 9, 20])).rejects.toThrow(/run in order/);
    await expect(h.cycle(a, club, [-9, -5, -5, 8, 9, 20])).rejects.toThrow(/close in the future/);
    const id = await h.cycle(a, club);
    await expect(h.cycle(a, club)).rejects.toThrow(/already has a reading cycle/);
    await expect(h.sql("insert into reading_cycles select (c).* from (select c from reading_cycles c where id = $1) x", [id])).rejects.toThrow(/duplicate key/);
    await h.rpc(a, "cancel_cycle", { p_cycle_id: id });
    await h.cycle(a, club);
  });
  it("open nominations only when scheduled", async () => {
    const a = await h.user();
    const club = await h.club(a);
    const id = await h.cycle(a, club, [1, 7, 7, 12, 12, 42]);
    const book = await h.importBook("Early");
    await expect(h.rpc(a, "nominate", { p_cycle_id: id, p_book_id: book })).rejects.toThrow(/not opened yet/);
    await h.sql("update reading_cycles set nomination_opens_at = now() - interval '1 minute' where id = $1", [id]);
    await h.rpc(a, "nominate", { p_cycle_id: id, p_book_id: book });
    expect((await h.cycleRow(id)).status).toBe("nominating");
  });
  it("cannot be written to directly or touched from another club", async () => {
    const [a, outsider] = [await h.user(), await h.user()];
    const id = await h.cycle(a, await h.club(a));
    await h.club(outsider);
    await expect(h.as(a, "update reading_cycles set status = 'completed'")).rejects.toThrow(/permission denied/);
    expect(await h.as(outsider, "select * from reading_cycles where id = $1", [id])).toEqual([]);
    for (const [fn, args] of [["cancel_cycle", {}], ["open_voting_now", {}], ["complete_cycle", {}], ["ballot_count", {}]] as const) {
      await expect(h.rpc(outsider, fn, { p_cycle_id: id, ...args })).rejects.toThrow(/could not be found/);
    }
    await expect(h.rpc(outsider, "nominate", { p_cycle_id: id, p_book_id: await h.importBook("X") })).rejects.toThrow(/could not be found/);
  });
});

describe("nominations", () => {
  async function open() {
    const [a, b] = [await h.user(), await h.user()];
    const club = await h.club(a);
    await h.join(a, club, b);
    return { a, b, club, cycle: await h.cycle(a, club), x: await h.importBook("X"), y: await h.importBook("Y") };
  }
  it("are one per member, editable and withdrawable", async () => {
    const { a, b, cycle, x, y } = await open();
    const id = await h.rpc(a, "nominate", { p_cycle_id: cycle, p_book_id: x, p_explanation: "why" });
    await expect(h.rpc(a, "nominate", { p_cycle_id: cycle, p_book_id: y })).rejects.toThrow(/already nominated a book/);
    await expect(h.rpc(b, "nominate", { p_cycle_id: cycle, p_book_id: x })).rejects.toThrow(/already been nominated/);
    await expect(h.rpc(b, "update_nomination", { p_nomination_id: id, p_book_id: y, p_explanation: "" })).rejects.toThrow(/could not be found/);
    await h.rpc(a, "update_nomination", { p_nomination_id: id, p_book_id: y, p_explanation: "better" });
    await h.rpc(a, "withdraw_nomination", { p_nomination_id: id });
    expect(await h.as(b, "select * from nominations where cycle_id = $1", [cycle])).toEqual([]);
    await h.rpc(a, "nominate", { p_cycle_id: cycle, p_book_id: x });
    await expect(h.as(a, "insert into nominations (cycle_id, club_id, book_id) values ($1, $1, $1)", [cycle])).rejects.toThrow(/permission denied/);
  });
  it("stay one per member under concurrent submission", async () => {
    const { a, cycle, x, y } = await open();
    const out = await Promise.allSettled([x, y].map((b) => h.rpc(a, "nominate", { p_cycle_id: cycle, p_book_id: b })));
    expect(out.filter((o) => o.status === "fulfilled")).toHaveLength(1);
  });
  it("close on time even if nobody has visited since", async () => {
    const { a, b, cycle, x, y } = await open();
    const id = await h.rpc(a, "nominate", { p_cycle_id: cycle, p_book_id: x });
    await h.sql("update reading_cycles set nomination_closes_at = now() - interval '1 second', voting_opens_at = now() + interval '1 day' where id = $1", [cycle]);
    await expect(h.rpc(b, "nominate", { p_cycle_id: cycle, p_book_id: y })).rejects.toThrow(/closed/);
    await expect(h.rpc(a, "withdraw_nomination", { p_nomination_id: id })).rejects.toThrow(/closed/);
    await expect(h.rpc(b, "reopen_nominations", { p_cycle_id: cycle, p_nomination_closes_at: inDays(2), p_voting_closes_at: inDays(4) })).rejects.toThrow(/administrator/);
    await h.rpc(a, "sync_club", { p_club_id: (await h.cycleRow(cycle)).club_id });
    expect((await h.cycleRow(cycle)).status).toBe("nominations_closed");
    await h.rpc(a, "reopen_nominations", { p_cycle_id: cycle, p_nomination_closes_at: inDays(2), p_voting_closes_at: inDays(4) });
    await h.rpc(b, "nominate", { p_cycle_id: cycle, p_book_id: y });
  });
  it("need two books for a vote; a sole nomination is confirmed openly", async () => {
    const { a, b, cycle, club, x } = await open();
    const past = "update reading_cycles set nomination_opens_at = now() - interval '9 days', nomination_closes_at = now() - interval '2 days', voting_opens_at = now() - interval '2 days' where id = $1";
    await h.sql(past, [cycle]);
    await h.rpc(a, "sync_club", { p_club_id: club });
    expect((await h.cycleRow(cycle)).status).toBe("nominations_closed");
    await expect(h.rpc(a, "confirm_sole_nomination", { p_cycle_id: cycle })).rejects.toThrow(/single book/);
    await h.rpc(a, "reopen_nominations", { p_cycle_id: cycle, p_nomination_closes_at: inDays(1), p_voting_closes_at: inDays(2) });
    await h.rpc(b, "nominate", { p_cycle_id: cycle, p_book_id: x });
    await h.sql(past, [cycle]);
    await h.rpc(b, "sync_club", { p_club_id: club });
    await expect(h.rpc(b, "confirm_sole_nomination", { p_cycle_id: cycle })).rejects.toThrow(/administrator/);
    await h.rpc(a, "confirm_sole_nomination", { p_cycle_id: cycle });
    expect(await h.cycleRow(cycle)).toMatchObject({ status: "reading", book_id: x, decision_method: "sole_nomination" });
  });
  it("leave with a member who leaves while nominations are open", async () => {
    const { a, b, club, cycle, x } = await open();
    await h.rpc(b, "nominate", { p_cycle_id: cycle, p_book_id: x });
    await h.rpc(b, "leave_club", { p_club_id: club });
    expect(await h.as(a, "select * from nominations where cycle_id = $1", [cycle])).toEqual([]);
  });
});

describe("ranked voting", () => {
  it("scores by Borda count and starts reading the winner", async () => {
    const { people: [a, b, c], cycle, nominations: [x, y, z] } = await h.votingClub(3) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    await ballot(a, cycle, [x, y, z]);
    await ballot(b, cycle, [y, x, z]);
    await ballot(c, cycle, [y, z, x]);
    await h.rpc(a, "close_voting_now", { p_cycle_id: cycle });
    const results = await h.as(c, "select nomination_id, score, is_top from vote_results where cycle_id = $1 order by score desc", [cycle]);
    expect(results).toEqual([
      { nomination_id: y, score: 8, is_top: true },  // 2 + 3 + 3
      { nomination_id: x, score: 6, is_top: false }, // 3 + 2 + 1
      { nomination_id: z, score: 4, is_top: false }, // 1 + 1 + 2
    ]);
    const row = await h.cycleRow(cycle);
    expect(row).toMatchObject({ status: "reading", decision_method: "vote" });
    expect(await h.as(a, "select ballots_cast, eligible_voters from vote_rounds where cycle_id = $1", [cycle])).toEqual([{ ballots_cast: 3, eligible_voters: 3 }]);
    expect((await h.sql("select book_id from nominations where id = $1", [y]))[0]!.book_id).toBe(row.book_id);
  });
  it("keeps one ballot per member, revisable until the close", async () => {
    const { people, cycle, nominations: [x, y] } = await h.votingClub(2);
    await ballot(people[0]!, cycle, [x, y]);
    await ballot(people[0]!, cycle, [y, x]);
    expect(await h.sql("select 1 from votes where cycle_id = $1", [cycle])).toHaveLength(1);
    expect(await h.as(people[0]!, "select nomination_id from vote_rankings where cycle_id = $1 order by rank", [cycle])).toEqual([{ nomination_id: y }, { nomination_id: x }]);
    expect(await h.rpc(people[1]!, "ballot_count", { p_cycle_id: cycle })).toEqual({ cast: 1, eligible: 2 });
  });
  it("rejects every malformed ballot", async () => {
    const { people: [a], cycle, nominations: [x, y, z] } = await h.votingClub(3) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const foreign = (await h.votingClub(2)).nominations[0];
    for (const bad of [[], [x], [x, y], [x, x, y], [x, y, z, x], [x, y, foreign], [x, y, null], null]) {
      await expect(ballot(a, cycle, bad)).rejects.toThrow(/ranks every nominated book/);
    }
    await expect(h.rpc(a, "submit_ballot", { p_cycle_id: cycle, p_ranking: [[x, y, z]] })).rejects.toThrow(/ranks every/);
    expect(await h.sql("select 1 from votes where cycle_id = $1", [cycle])).toEqual([]);
  });
  it("refuses outsiders", async () => {
    const { cycle, nominations } = await h.votingClub(2);
    await expect(ballot(await h.user(), cycle, nominations)).rejects.toThrow(/could not be found/);
  });
  it("hides ballots from everyone but the voter, and results until the close", async () => {
    const { people: [a, b], cycle, nominations } = await h.votingClub(2) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    await ballot(b, cycle, nominations);
    for (const t of ["votes", "vote_rankings", "vote_results", "vote_rounds"]) expect(await h.as(a, `select * from ${t}`)).toEqual([]);
    expect(await h.as(b, "select * from vote_rankings")).toHaveLength(2);
    await expect(h.as(a, "insert into votes (cycle_id, user_id) values ($1, $2)", [cycle, a])).rejects.toThrow(/permission denied/);
    await expect(h.as(b, "update vote_rankings set rank = 9")).rejects.toThrow(/permission denied/);
    await h.rpc(a, "close_voting_now", { p_cycle_id: cycle });
    expect(await h.as(a, "select * from vote_rankings")).toEqual([]);
    expect(await h.as(a, "select * from vote_results")).toHaveLength(2);
  });
  it("turns away a ballot that arrives after the deadline", async () => {
    const { people, club, cycle, nominations } = await h.votingClub(2);
    await ballot(people[0]!, cycle, nominations);
    await h.sql("update reading_cycles set nomination_opens_at = now() - interval '9 days', nomination_closes_at = now() - interval '3 days', voting_opens_at = now() - interval '2 days', voting_closes_at = now() - interval '1 second' where id = $1", [cycle]);
    await expect(ballot(people[1]!, cycle, [...nominations].reverse())).rejects.toThrow(/Voting is not open/);
    await h.rpc(people[1]!, "sync_club", { p_club_id: club });
    expect((await h.cycleRow(cycle)).status).toBe("reading");
    expect(await h.sql("select ballots_cast from vote_rounds where cycle_id = $1", [cycle])).toEqual([{ ballots_cast: 1 }]);
  });
  it("closes a round exactly once when several people arrive together", async () => {
    const { people, club, cycle, nominations } = await h.votingClub(3);
    await ballot(people[0]!, cycle, nominations);
    await h.sql("update reading_cycles set nomination_opens_at = now() - interval '9 days', nomination_closes_at = now() - interval '3 days', voting_opens_at = now() - interval '2 days', voting_closes_at = now() - interval '1 second' where id = $1", [cycle]);
    await Promise.all(people.map((p) => h.rpc(p, "sync_club", { p_club_id: club })));
    expect(await h.sql("select 1 from vote_rounds where cycle_id = $1", [cycle])).toHaveLength(1);
    expect(await h.sql("select 1 from activity_events where reference_id = $1 and type = 'book_selected'", [cycle])).toHaveLength(1);
  });
  it("does not count ballots from people who have left", async () => {
    const { people, club, cycle, nominations: [x, y] } = await h.votingClub(3, 2);
    await ballot(people[0]!, cycle, [x, y]);
    await ballot(people[2]!, cycle, [y, x]);
    await h.rpc(people[2]!, "leave_club", { p_club_id: club });
    await h.rpc(people[0]!, "close_voting_now", { p_cycle_id: cycle });
    expect(await h.cycleRow(cycle)).toMatchObject({ status: "reading", decision_method: "vote" });
    expect(await h.sql("select ballots_cast, eligible_voters from vote_rounds where cycle_id = $1", [cycle])).toEqual([{ ballots_cast: 1, eligible_voters: 2 }]);
  });
  it("gives late decisions their full reading period", async () => {
    const { people, cycle, nominations } = await h.votingClub(2);
    const before = await h.cycleRow(cycle);
    await ballot(people[0]!, cycle, nominations);
    await h.sql("update reading_cycles set reading_starts_at = now() - interval '1 hour', reading_ends_at = now() + interval '9 days 23 hours' where id = $1", [cycle]);
    await h.rpc(people[0]!, "close_voting_now", { p_cycle_id: cycle });
    const after = await h.cycleRow(cycle);
    expect(before.status).toBe("voting");
    expect((after.reading_ends_at - after.reading_starts_at) / 86_400_000).toBeCloseTo(10, 1);
  });
});

describe("ties", () => {
  it("go to a runoff between the tied books only", async () => {
    const { people: [a, b, c], cycle, nominations: [x, y, z] } = await h.votingClub(3) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    await ballot(a, cycle, [x, y, z]);
    await ballot(b, cycle, [y, x, z]);
    await h.rpc(a, "close_voting_now", { p_cycle_id: cycle });
    expect(await h.cycleRow(cycle)).toMatchObject({ status: "runoff", book_id: null });
    expect((await h.sql("select id from nominations where cycle_id = $1 and in_runoff", [cycle])).map((r) => r.id).sort()).toEqual([x, y].sort());
    await expect(ballot(a, cycle, [x, y, z])).rejects.toThrow(/ranks every/);
    await expect(ballot(a, cycle, [x, z])).rejects.toThrow(/ranks every/);
    await ballot(a, cycle, [x, y]);
    await ballot(b, cycle, [y, x]);
    await ballot(c, cycle, [y, x]);
    await h.rpc(a, "close_voting_now", { p_cycle_id: cycle });
    expect(await h.cycleRow(cycle)).toMatchObject({ status: "reading", decision_method: "runoff" });
    expect(await h.sql("select score from vote_results where cycle_id = $1 and round = 2 order by score desc", [cycle])).toEqual([{ score: 5 }, { score: 4 }]);
  });
  it("still tied, are settled by an administrator with a recorded reason", async () => {
    const { people: [a, b], cycle, nominations: [x, y] } = await h.votingClub(2) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const tie = async () => { await ballot(a, cycle, [x, y]); await ballot(b, cycle, [y, x]); await h.rpc(a, "close_voting_now", { p_cycle_id: cycle }); };
    await tie();
    await tie();
    expect((await h.cycleRow(cycle)).status).toBe("awaiting_decision");
    await expect(h.rpc(b, "decide_selection", { p_cycle_id: cycle, p_nomination_id: x, p_reason: "coin toss" })).rejects.toThrow(/administrator/);
    await expect(h.rpc(a, "decide_selection", { p_cycle_id: cycle, p_nomination_id: x, p_reason: " " })).rejects.toThrow(/Record how/);
    await expect(h.rpc(a, "reopen_voting", { p_cycle_id: cycle, p_closes_at: inDays(1) })).rejects.toThrow(/no ballots/);
    await h.rpc(a, "decide_selection", { p_cycle_id: cycle, p_nomination_id: x, p_reason: "We tossed a coin together." });
    expect(await h.cycleRow(cycle)).toMatchObject({ status: "reading", decision_method: "admin_decision", decision_reason: "We tossed a coin together.", decided_by: a });
  });
  it("only allow a decision between the books still in contention", async () => {
    const { people: [a, b], cycle, nominations: [x, y, z] } = await h.votingClub(3) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    await ballot(a, cycle, [x, y, z]); await ballot(b, cycle, [y, x, z]);
    await h.rpc(a, "close_voting_now", { p_cycle_id: cycle });
    await h.rpc(a, "close_voting_now", { p_cycle_id: cycle }); // nobody votes in the runoff
    expect((await h.cycleRow(cycle)).status).toBe("awaiting_decision");
    await expect(h.rpc(a, "decide_selection", { p_cycle_id: cycle, p_nomination_id: z, p_reason: "because" })).rejects.toThrow(/still in contention/);
    await h.rpc(a, "reopen_voting", { p_cycle_id: cycle, p_closes_at: inDays(1) });
    expect((await h.cycleRow(cycle)).status).toBe("runoff");
  });
  it("with no ballots at all can reopen or be decided", async () => {
    const { people, cycle, nominations } = await h.votingClub(2);
    await h.rpc(people[0]!, "close_voting_now", { p_cycle_id: cycle });
    expect((await h.cycleRow(cycle)).status).toBe("awaiting_decision");
    await h.rpc(people[0]!, "reopen_voting", { p_cycle_id: cycle, p_closes_at: inDays(2) });
    await ballot(people[0]!, cycle, nominations);
    await h.rpc(people[0]!, "close_voting_now", { p_cycle_id: cycle });
    expect((await h.cycleRow(cycle)).status).toBe("reading");
  });
  it("discard ballots and results when nominations reopen, never after a choice", async () => {
    const { people, cycle, nominations } = await h.votingClub(2);
    await ballot(people[0]!, cycle, nominations);
    await h.rpc(people[0]!, "reopen_nominations", { p_cycle_id: cycle, p_nomination_closes_at: inDays(1), p_voting_closes_at: inDays(2) });
    expect(await h.sql("select 1 from votes where cycle_id = $1", [cycle])).toEqual([]);
    await h.rpc(people[0]!, "open_voting_now", { p_cycle_id: cycle });
    await ballot(people[0]!, cycle, nominations);
    await h.rpc(people[0]!, "close_voting_now", { p_cycle_id: cycle });
    await expect(h.rpc(people[0]!, "reopen_nominations", { p_cycle_id: cycle, p_nomination_closes_at: inDays(1), p_voting_closes_at: inDays(2) })).rejects.toThrow(/before a book/);
  });
});

describe("schedule edits", () => {
  it("cannot rewrite dates that have already taken effect", async () => {
    const { people, cycle } = await h.votingClub(2);
    const before = await h.cycleRow(cycle);
    const args = { p_cycle_id: cycle, p_nomination_opens_at: inDays(1), p_nomination_closes_at: inDays(2), p_voting_opens_at: inDays(3), p_voting_closes_at: inDays(20), p_reading_starts_at: inDays(21), p_reading_ends_at: inDays(50) };
    await expect(h.rpc(people[1]!, "update_cycle_schedule", args)).rejects.toThrow(/administrator/);
    await h.rpc(people[0]!, "update_cycle_schedule", args);
    const after = await h.cycleRow(cycle);
    expect(after.nomination_closes_at).toEqual(before.nomination_closes_at);
    expect(after.voting_closes_at.toISOString()).toBe(args.p_voting_closes_at);
    expect(after.status).toBe("voting");
  });
  it("can bring reading forward after an early result, until it begins", async () => {
    const { people, cycle, nominations } = await h.votingClub(2);
    await ballot(people[0]!, cycle, nominations);
    await h.rpc(people[0]!, "close_voting_now", { p_cycle_id: cycle });
    const move = (start: number) => h.rpc(people[0]!, "update_cycle_schedule", { p_cycle_id: cycle, p_nomination_opens_at: null, p_nomination_closes_at: null, p_voting_opens_at: null, p_voting_closes_at: null, p_reading_starts_at: inDays(start), p_reading_ends_at: inDays(30) });
    await move(-0.001);
    const begun = (await h.cycleRow(cycle)).reading_starts_at;
    expect(begun.getTime()).toBeLessThan(Date.now());
    await move(5);
    expect((await h.cycleRow(cycle)).reading_starts_at).toEqual(begun);
  });
});
