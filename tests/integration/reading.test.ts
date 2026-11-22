import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Harness } from "../support/harness";

let h: Harness;
beforeAll(async () => { h = await Harness.create("reading"); });
afterAll(() => h.end());

async function readingClub(n = 2) {
  const v = await h.votingClub(n, 2);
  await h.rpc(v.people[0]!, "submit_ballot", { p_cycle_id: v.cycle, p_ranking: v.nominations });
  await h.rpc(v.people[0]!, "close_voting_now", { p_cycle_id: v.cycle });
  return { ...v, admin: v.people[0]!, member: v.people[1]! };
}
const meeting = (who: string, club: string, extra: Record<string, unknown> = {}) => {
  const row: Record<string, unknown> = { club_id: club, title: "Round the table", starts_at: new Date(Date.now() + 864e5).toISOString(), timezone: "Africa/Kigali", ...extra };
  const keys = Object.keys(row);
  return h.as(who, `insert into meetings (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`, Object.values(row)).then((r) => r[0]!.id as string);
};

describe("reading progress", () => {
  it("is recorded by each member for themselves, while reading", async () => {
    const { admin, member, cycle } = await readingClub();
    const put = (who: string, uid: string) => h.as(who, "insert into reading_progress (cycle_id, user_id, status, current_page) values ($1, $2, 'reading', 40) on conflict (cycle_id, user_id) do update set status = excluded.status, current_page = excluded.current_page", [cycle, uid]);
    await put(member, member);
    await put(member, member);
    await expect(put(admin, member)).rejects.toThrow(/row-level security/);
    expect(await h.as(admin, "select user_id, current_page from reading_progress")).toEqual([{ user_id: member, current_page: 40 }]);
    expect(await h.as(admin, "update reading_progress set status = 'finished' where user_id = $1 returning id", [member])).toEqual([]);
    const outsider = await h.user();
    expect(await h.as(outsider, "select * from reading_progress")).toEqual([]);
    await expect(put(outsider, outsider)).rejects.toThrow(/row-level security/);
    await h.rpc(admin, "complete_cycle", { p_cycle_id: cycle });
    expect(await h.as(member, "update reading_progress set current_page = 99 where user_id = $1 returning id", [member])).toEqual([]);
  });
});

describe("meetings", () => {
  it("are created, edited and cancelled by administrators", async () => {
    const { admin, member, club, cycle } = await readingClub();
    await expect(meeting(member, club)).rejects.toThrow(/row-level security/);
    const id = await meeting(admin, club, { cycle_id: cycle, discussion_leader_id: member, location: "The Library" });
    expect(await h.as(member, "update meetings set title = 'x' where id = $1 returning id", [id])).toEqual([]);
    await h.as(admin, "update meetings set location = 'The Cafe' where id = $1", [id]);
    await h.as(admin, "update meetings set status = 'cancelled' where id = $1", [id]);
    expect((await h.as(member, "select type from notifications where reference_id = $1", [id])).map((r) => r.type).sort()).toEqual(["meeting_cancelled", "meeting_created", "meeting_updated"]);
    await expect(h.as(member, "insert into meeting_attendees (meeting_id, user_id, attendance_status) values ($1, $2, 'going')", [id, member])).rejects.toThrow(/row-level security/);
  });
  it("stay inside their club", async () => {
    const one = await readingClub();
    const two = await readingClub();
    await expect(meeting(one.admin, two.club)).rejects.toThrow(/row-level security/);
    await expect(meeting(one.admin, one.club, { cycle_id: two.cycle })).rejects.toThrow(/foreign key/);
    await expect(meeting(one.admin, one.club, { discussion_leader_id: two.member })).rejects.toThrow(/must be a member/);
    await expect(meeting(one.admin, one.club, { timezone: "Middle/Earth" })).rejects.toThrow(/not recognised/);
    const id = await meeting(one.admin, one.club);
    expect(await h.as(two.admin, "select * from meetings where id = $1", [id])).toEqual([]);
    await expect(h.as(one.admin, "update meetings set club_id = $1", [two.club])).rejects.toThrow(/permission denied/);
  });
  it("take attendance from each member", async () => {
    const { admin, member, club } = await readingClub();
    const id = await meeting(admin, club);
    const answer = (who: string, uid: string, s: string) => h.as(who, "insert into meeting_attendees (meeting_id, user_id, attendance_status) values ($1, $2, $3) on conflict (meeting_id, user_id) do update set attendance_status = excluded.attendance_status", [id, uid, s]);
    await answer(member, member, "maybe");
    await answer(member, member, "going");
    await expect(answer(admin, member, "not_going")).rejects.toThrow(/row-level security/);
    expect(await h.as(admin, "select attendance_status from meeting_attendees where meeting_id = $1", [id])).toEqual([{ attendance_status: "going" }]);
    await expect(answer(await h.user(), member, "going")).rejects.toThrow(/row-level security/);
  });
  it("are written up by an administrator or the discussion leader", async () => {
    const { admin, people, club } = await readingClub(3);
    const [, leader, other] = people as [string, string, string];
    const id = await meeting(admin, club, { discussion_leader_id: leader });
    await expect(h.rpc(other, "record_meeting_outcomes", { p_meeting_id: id, p_outcomes: "x" })).rejects.toThrow(/Only an administrator/);
    await h.rpc(leader, "record_meeting_outcomes", { p_meeting_id: id, p_outcomes: "We argued about the ending.", p_completed: true });
    expect((await h.as(other, "select outcomes, status from meetings where id = $1", [id]))[0]).toEqual({ outcomes: "We argued about the ending.", status: "completed" });
  });
  it("without a leader cannot be written up by an ordinary member", async () => {
    const { admin, member, club } = await readingClub();
    const id = await meeting(admin, club);
    await expect(h.rpc(member, "record_meeting_outcomes", { p_meeting_id: id, p_outcomes: "x" })).rejects.toThrow(/Only an administrator/);
  });
});

describe("discussion", () => {
  it("keeps questions, notes and quotations inside the club", async () => {
    const { admin, member, club, cycle } = await readingClub();
    const other = await readingClub();
    await h.as(member, "insert into discussion_questions (club_id, cycle_id, question) values ($1, $2, 'Why?')", [club, cycle]);
    await h.as(member, "insert into discussion_notes (club_id, cycle_id, kind, content, source) values ($1, $2, 'quotation', 'Light is the left hand of darkness', 'p. 233')", [club, cycle]);
    expect(await h.as(admin, "select 1 from discussion_notes")).toHaveLength(1);
    expect(await h.as(other.admin, "select 1 from discussion_notes")).toEqual([]);
    await expect(h.as(other.admin, "insert into discussion_notes (club_id, cycle_id, content) values ($1, $2, 'x')", [club, cycle])).rejects.toThrow(/row-level security/);
    await expect(h.as(other.admin, "insert into discussion_notes (club_id, cycle_id, content) values ($1, $2, 'x')", [other.club, cycle])).rejects.toThrow(/foreign key/);
    await expect(h.as(admin, "insert into discussion_notes (club_id, content) values ($1, 'x')", [club])).rejects.toThrow(/check constraint/);
    expect(await h.as(admin, "update discussion_notes set content = 'x' returning id")).toEqual([]);
    await expect(h.as(member, "update discussion_notes set created_by = $1", [admin])).rejects.toThrow(/permission denied/);
    expect(await h.as(admin, "delete from discussion_questions returning id")).toHaveLength(1);
  });
  it("keeps club reviews separate from personal ones", async () => {
    const { member, admin, cycle } = await readingClub();
    const book = (await h.cycleRow(cycle)).book_id;
    await h.shelve(member, book);
    await h.as(member, "insert into personal_reviews (user_id, book_id, review_text) values ($1, $2, 'only mine')", [member, book]);
    await h.rpc(member, "save_club_review", { p_cycle_id: cycle, p_rating: 4, p_text: "For the club" });
    await h.rpc(member, "save_club_review", { p_cycle_id: cycle, p_rating: 5, p_text: "For the club, revised" });
    expect(await h.as(admin, "select rating, review_text from book_reviews")).toEqual([{ rating: 5, review_text: "For the club, revised" }]);
    expect(await h.as(member, "select review_text from personal_reviews")).toEqual([{ review_text: "only mine" }]);
    expect(await h.as(admin, "select * from personal_reviews")).toEqual([]);
  });
  it("does not take club reviews before a book is chosen", async () => {
    const { people, cycle } = await h.votingClub(2);
    await expect(h.rpc(people[0]!, "save_club_review", { p_cycle_id: cycle, p_rating: 4, p_text: "x" })).rejects.toThrow(/once the club is reading/);
  });
});

describe("archive", () => {
  it("preserves everything when a new cycle begins and when people tidy their own shelves", async () => {
    const { admin, member, club, cycle } = await readingClub();
    const book = (await h.cycleRow(cycle)).book_id;
    await h.shelve(member, book);
    await meeting(admin, club, { cycle_id: cycle });
    await h.as(member, "insert into discussion_questions (club_id, cycle_id, question) values ($1, $2, 'Why?')", [club, cycle]);
    await expect(h.rpc(member, "complete_cycle", { p_cycle_id: cycle })).rejects.toThrow(/administrator/);
    await h.rpc(admin, "complete_cycle", { p_cycle_id: cycle });
    await h.as(member, "delete from user_books where book_id = $1", [book]);
    const next = await h.cycle(admin, club);
    await expect(h.rpc(admin, "reopen_cycle", { p_cycle_id: cycle })).rejects.toThrow(/under way/);
    expect(await h.as(member, "select status, number from reading_cycles order by number")).toEqual([{ status: "completed", number: 1 }, { status: "nominating", number: 2 }]);
    for (const t of ["nominations", "vote_results", "vote_rounds", "meetings", "discussion_questions"]) {
      expect((await h.as(member, `select 1 from ${t} where cycle_id = $1`, [cycle])).length, t).toBeGreaterThan(0);
    }
    await h.rpc(admin, "cancel_cycle", { p_cycle_id: next });
    await h.rpc(admin, "reopen_cycle", { p_cycle_id: cycle });
    expect((await h.cycleRow(cycle)).status).toBe("reading");
  });
});

describe("upserts as PostgREST sends them", () => {
  it("can revise one's own rows but not hand them to someone else", async () => {
    const { admin, member, club, cycle } = await readingClub();
    const book = (await h.cycleRow(cycle)).book_id;
    const meet = await meeting(admin, club);
    await h.shelve(member, book);
    const cases: [string, string[], unknown[], string][] = [
      ["personal_reviews", ["user_id", "book_id", "rating"], [member, book, 3], "user_id, book_id"],
      ["reading_progress", ["cycle_id", "user_id", "status"], [cycle, member, "reading"], "cycle_id, user_id"],
      ["meeting_attendees", ["meeting_id", "user_id", "attendance_status"], [meet, member, "going"], "meeting_id, user_id"],
    ];
    for (const [table, cols, values, key] of cases) {
      const sql = `insert into ${table} (${cols.join(", ")}) values ($1, $2, $3) on conflict (${key}) do update set ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}`;
      await h.as(member, sql, values);
      await h.as(member, sql, values);
      await expect(h.as(member, `update ${table} set user_id = $1`, [admin]), table).rejects.toThrow(/row-level security|foreign key/);
    }
  });
});

describe("surface area", () => {
  it("has RLS on every public table", async () => {
    expect(await h.sql("select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity")).toEqual([]);
  });
  it("pins search_path on every security definer function", async () => {
    expect(await h.sql("select proname from pg_proc where pronamespace in ('public'::regnamespace, 'private'::regnamespace) and prosecdef and not coalesce(proconfig::text like '%search_path%', false)")).toEqual([]);
  });
  it("lets signed-out visitors call exactly one function and read no tables", async () => {
    expect(await h.sql("select proname from pg_proc where pronamespace = 'public'::regnamespace and has_function_privilege('anon', oid, 'execute')")).toEqual([{ proname: "preview_invitation" }]);
    expect(await h.sql("select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and has_any_column_privilege('anon', oid, 'select')")).toEqual([]);
  });
  it("keeps import_book to the service role", async () => {
    expect(await h.sql("select has_function_privilege('authenticated', 'public.import_book(jsonb, boolean)', 'execute') a, has_function_privilege('service_role', 'public.import_book(jsonb, boolean)', 'execute') s")).toEqual([{ a: false, s: true }]);
  });
  it("shows a person in two clubs only the right rows in each", async () => {
    const one = await readingClub();
    const two = await readingClub();
    await h.join(two.admin, two.club, one.member);
    const rows = await h.as(one.member, "select distinct club_id from reading_cycles");
    expect(rows.map((r) => r.club_id).sort()).toEqual([one.club, two.club].sort());
    expect((await h.as(one.admin, "select distinct club_id from reading_cycles")).map((r) => r.club_id)).toEqual([one.club]);
  });
  it("lets people mark only their own notifications read", async () => {
    const { admin, member } = await readingClub();
    expect((await h.as(member, "select 1 from notifications")).length).toBeGreaterThan(0);
    expect((await h.as(member, "update notifications set read_at = now() returning user_id")).every((r) => r.user_id === member)).toBe(true);
    await expect(h.as(admin, "update notifications set user_id = $1", [admin])).rejects.toThrow(/permission denied/);
    await expect(h.as(admin, "insert into notifications (user_id, type) values ($1, 'x')", [member])).rejects.toThrow(/permission denied/);
  });
});
