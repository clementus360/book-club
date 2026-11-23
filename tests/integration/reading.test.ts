import { createHash, randomUUID } from "node:crypto";
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

describe("finding a date", () => {
  const at = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
  const ask = (who: string, club: string, times: (string | null)[], extra: Record<string, unknown> = {}) =>
    h.rpc(who, "create_meeting_poll", { p_club_id: club, p_cycle_id: null, p_title: "Supper", p_location: "Here", p_timezone: "Africa/Kigali", p_times: times, ...extra });
  const timesOf = async (who: string, poll: string) => (await h.as(who, "select id from meeting_poll_times where poll_id = $1 order by starts_at", [poll])).map((r) => r.id as string);

  it("goes from suggested times to a meeting that keeps people's answers", async () => {
    const { admin, member, club, cycle, people } = await readingClub(4);
    const poll = await ask(admin, club, [at(3), at(4), at(4)], { p_cycle_id: cycle });
    const [one, two] = await timesOf(member, poll) as [string, string];
    expect((await h.as(member, "select type from notifications where reference_id = $1", [poll])).map((r) => r.type)).toEqual(["poll_opened"]);
    const answer = (who: string, a: string, b: string) => h.rpc(who, "answer_meeting_poll", { p_poll_id: poll, p_answers: { [one]: a, [two]: b } });
    await answer(admin, "yes", "no");
    await answer(member, "no", "no");
    await answer(member, "no", "if_needed");
    await answer(people[2]!, "yes", "yes");
    await answer(people[3]!, "yes", "yes");
    expect((await h.as(admin, "select answer from meeting_poll_answers where user_id = $1 and time_id = $2", [member, two]))).toEqual([{ answer: "if_needed" }]);
    await h.rpc(people[3]!, "leave_club", { p_club_id: club });
    const meetingId = await h.rpc(admin, "choose_meeting_time", { p_time_id: two });
    expect(await h.as(member, "select title, location, timezone, cycle_id, created_by, status from meetings where id = $1", [meetingId]))
      .toEqual([{ title: "Supper", location: "Here", timezone: "Africa/Kigali", cycle_id: cycle, created_by: admin, status: "scheduled" }]);
    const said = await h.as(admin, "select user_id, attendance_status from meeting_attendees where meeting_id = $1", [meetingId]);
    expect(Object.fromEntries(said.map((r) => [r.user_id, r.attendance_status]))).toEqual({ [admin]: "not_going", [member]: "maybe", [people[2]!]: "going" });
    await expect(h.rpc(admin, "choose_meeting_time", { p_time_id: one })).rejects.toThrow(/settled already/);
    await expect(answer(member, "yes", "yes")).rejects.toThrow(/settled already/);
  });
  it("makes one meeting when two administrators choose at once", async () => {
    const { admin, member, club } = await readingClub();
    await h.rpc(admin, "set_member_role", { p_club_id: club, p_user_id: member, p_role: "admin" });
    const poll = await ask(admin, club, [at(3), at(4)]);
    const [one, two] = await timesOf(admin, poll) as [string, string];
    const results = await Promise.allSettled([h.rpc(admin, "choose_meeting_time", { p_time_id: one }), h.rpc(member, "choose_meeting_time", { p_time_id: two })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await h.as(admin, "select 1 from meetings where club_id = $1", [club])).toHaveLength(1);
  });
  it("is arranged by administrators, and answered by members for themselves", async () => {
    const { admin, member, club } = await readingClub();
    const other = await readingClub();
    await expect(ask(member, club, [at(1), at(2)])).rejects.toThrow(/Only a club administrator/);
    await expect(ask(other.admin, club, [at(1), at(2)])).rejects.toThrow(/Only a club administrator/);
    const poll = await ask(admin, club, [at(1), at(2)]);
    const [one] = await timesOf(admin, poll) as [string];
    for (const t of ["meeting_polls", "meeting_poll_times", "meeting_poll_answers"]) expect(await h.as(other.admin, `select * from ${t}`)).toEqual([]);
    await expect(h.rpc(other.admin, "answer_meeting_poll", { p_poll_id: poll, p_answers: { [one]: "yes" } })).rejects.toThrow(/could not be found/);
    await expect(h.rpc(other.admin, "choose_meeting_time", { p_time_id: one })).rejects.toThrow(/could not be found/);
    for (const [fn, args] of [["choose_meeting_time", { p_time_id: one }], ["stop_meeting_poll", { p_poll_id: poll }], ["add_meeting_poll_time", { p_poll_id: poll, p_starts_at: at(5) }]] as const)
      await expect(h.rpc(member, fn, args)).rejects.toThrow(/Only a club administrator/);
    await expect(h.as(member, "insert into meeting_poll_answers (time_id, poll_id, user_id, answer) values ($1, $2, $3, 'yes')", [one, poll, admin])).rejects.toThrow(/permission denied/);
    await expect(h.as(admin, "update meeting_polls set title = 'x'")).rejects.toThrow(/permission denied/);
  });
  it("refuses times and answers that make no sense", async () => {
    const { admin, member, club } = await readingClub();
    const two = await readingClub();
    await expect(ask(admin, club, [at(1)])).rejects.toThrow(/between two and eight/);
    await expect(ask(admin, club, [at(1), at(1)])).rejects.toThrow(/between two and eight/);
    await expect(ask(admin, club, Array.from({ length: 9 }, (_, i) => at(i + 1)))).rejects.toThrow(/between two and eight/);
    await expect(ask(admin, club, [at(-1), at(1)])).rejects.toThrow(/in the future/);
    await expect(ask(admin, club, [null, at(1), at(2)])).rejects.toThrow(/in the future/);
    await expect(ask(admin, club, [at(1), at(2)], { p_title: "  " })).rejects.toThrow(/title/);
    await expect(ask(admin, club, [at(1), at(2)], { p_timezone: "Middle/Earth" })).rejects.toThrow(/not recognised/);
    await expect(ask(admin, club, [at(1), at(2)], { p_cycle_id: two.cycle })).rejects.toThrow(/foreign key/);
    const poll = await ask(admin, club, [at(1), at(2)]);
    const elsewhere = await ask(two.admin, two.club, [at(1), at(2)]);
    const [one] = await timesOf(admin, poll) as [string];
    const [theirs] = await timesOf(two.admin, elsewhere) as [string];
    const answer = (a: unknown) => h.rpc(member, "answer_meeting_poll", { p_poll_id: poll, p_answers: a });
    await expect(answer({})).rejects.toThrow(/Choose an answer/);
    await expect(answer([])).rejects.toThrow(/Choose an answer/);
    await expect(answer({ [one]: "perhaps" })).rejects.toThrow(/have changed/);
    await expect(answer({ [one]: null })).rejects.toThrow(/have changed/);
    await expect(answer({ [theirs]: "yes" })).rejects.toThrow(/have changed/);
    await expect(answer({ nonsense: "yes" })).rejects.toThrow(/have changed/);
    await h.rpc(admin, "add_meeting_poll_time", { p_poll_id: poll, p_starts_at: at(9) });
    await expect(h.rpc(admin, "add_meeting_poll_time", { p_poll_id: poll, p_starts_at: at(-9) })).rejects.toThrow(/in the future/);
    await h.sql("update meeting_poll_times set starts_at = now() - interval '1 hour' where id = $1", [one]);
    await expect(h.rpc(admin, "choose_meeting_time", { p_time_id: one })).rejects.toThrow(/has passed/);
  });
  it("leaves nothing to answer once stopped", async () => {
    const { admin, member, club } = await readingClub();
    const poll = await ask(admin, club, [at(1), at(2)]);
    await h.rpc(admin, "stop_meeting_poll", { p_poll_id: poll });
    expect(await h.as(member, "select 1 from notifications where reference_id = $1", [poll])).toEqual([]);
    expect(await h.as(member, "select 1 from activity_events where reference_id = $1", [poll])).toEqual([]);
    await expect(h.rpc(admin, "stop_meeting_poll", { p_poll_id: poll })).rejects.toThrow(/settled already/);
  });
});

describe("calendar links", () => {
  const token = (c: string) => c.repeat(43);
  const hash = (t: string) => createHash("sha256").update(t).digest("hex");
  const link = (who: string, t: string) => h.as(who, "insert into calendar_links (user_id, nonce, token_hash) values ($1, $2, $3)", [who, randomUUID(), hash(t)]);
  const feed = async (t: string | null) => (await h.as(null, "select calendar_feed($1) f", [t]))[0]!.f as { id: string; cancelled: boolean }[] | null;

  it("show the meetings of the reader's own clubs, and nothing more", async () => {
    const { admin, member, club } = await readingClub();
    const other = await readingClub();
    const id = await meeting(admin, club, { agenda: "SECRET AGENDA", description: "SECRET DESCRIPTION", location: "Here" });
    const off = await meeting(admin, club);
    const declined = await meeting(admin, club);
    await meeting(other.admin, other.club);
    await h.as(admin, "update meetings set status = 'cancelled', outcomes = 'SECRET OUTCOME' where id = $1", [off]).catch(() => h.as(admin, "update meetings set status = 'cancelled' where id = $1", [off]));
    await h.as(member, "insert into meeting_attendees (meeting_id, user_id, attendance_status) values ($1, $2, 'not_going')", [declined, member]);
    await link(member, token("m"));
    const seen = (await feed(token("m")))!;
    expect(seen.map((m) => [m.id, m.cancelled]).sort()).toEqual([[id, false], [off, true]].sort());
    expect(JSON.stringify(seen)).not.toContain("SECRET");
    expect(Object.keys(seen[0]!).sort()).toEqual(["cancelled", "club", "created_at", "id", "location", "starts_at", "title", "updated_at"]);
    // Leaving the club takes its meetings away.
    await h.rpc(member, "leave_club", { p_club_id: club });
    expect(await feed(token("m"))).toEqual([]);
    // Turning it off, or deleting the account, ends it.
    await h.as(member, "delete from calendar_links where user_id = $1", [member]);
    expect(await feed(token("m"))).toBeNull();
  });
  it("cannot be guessed, read or changed by anyone else", async () => {
    const [a, b] = [await h.user(), await h.user()];
    await link(a, token("a"));
    for (const t of [null, "", "x", token("z"), hash(token("a")), hash(token("a")).slice(0, 43), `${token("a")}a`]) expect(await feed(t)).toBeNull();
    expect(await h.as(b, "select * from calendar_links")).toEqual([]);
    expect(await h.as(b, "update calendar_links set token_hash = $1 returning user_id", [hash(token("b"))])).toEqual([]);
    expect(await h.as(b, "delete from calendar_links returning user_id")).toEqual([]);
    await expect(h.as(b, "insert into calendar_links (user_id, nonce, token_hash) values ($1, $2, $3)", [a, randomUUID(), hash(token("c"))])).rejects.toThrow(/row-level security|duplicate/);
    await expect(link(b, token("a"))).rejects.toThrow(/duplicate/);
    await expect(h.as(b, "insert into calendar_links (user_id, nonce, token_hash) values ($1, $2, 'raw')", [b, randomUUID()])).rejects.toThrow(/check constraint/);
    await expect(h.as(null, "select * from calendar_links")).rejects.toThrow(/permission denied/);
    expect(await feed(token("a"))).toEqual([]);
  });
});

describe("email", () => {
  const owed = (who: string) => h.sql("select n.type from private.email_outbox o join notifications n on n.id = o.notification_id where o.user_id = $1 order by n.created_at", [who]).then((r) => r.map((x) => x.type));
  it("is owed for milestones only, to people who want it", async () => {
    const { admin, member, club, cycle } = await readingClub(3);
    const quiet = (await h.sql("select user_id from club_memberships where club_id = $1 and user_id not in ($2, $3)", [club, admin, member]))[0]!.user_id as string;
    expect(await owed(member)).toEqual(expect.arrayContaining(["nominations_opened", "voting_opened", "book_selected"]));
    expect(await owed(member)).not.toContain("book_nominated");
    await h.as(quiet, "update profiles set email_updates = false where id = $1", [quiet]);
    await h.sql("delete from private.email_outbox");
    const id = await meeting(admin, club, { cycle_id: cycle });
    expect(await owed(member)).toEqual(["meeting_created"]);
    expect(await owed(quiet)).toEqual([]);
    expect(await owed(admin)).toEqual([]); // nobody is told about what they did themselves
    await h.as(admin, "update meetings set status = 'cancelled' where id = $1", [id]);
    expect(await owed(member)).toEqual(["meeting_created", "meeting_cancelled"]);
  });
  it("is handed out once, with what the email needs, and only to the server", async () => {
    const { admin, member, club } = await readingClub();
    await h.sql("delete from private.email_outbox");
    await meeting(admin, club, { title: "Supper", location: "Here", agenda: "SECRET" });
    const claim = async () => (await h.as("service", "select claim_emails(10) c"))[0]!.c as Record<string, unknown>[];
    const [first, ...rest] = await claim();
    expect(rest).toEqual([]);
    expect(first).toMatchObject({ type: "meeting_created", user_id: member, club_id: club, meeting: { title: "Supper", location: "Here" } });
    expect(first!.email).toMatch(/@/);
    expect(JSON.stringify(first)).not.toContain("SECRET");
    expect(await claim()).toEqual([]); // claimed: not handed out again for ten minutes
    await h.as("service", "select finish_emails($1, '{}')", [[first!.id]]);
    await h.sql("update private.email_outbox set claimed_at = now() - interval '1 hour'");
    expect(await claim()).toEqual([]); // sent is sent
    for (const who of [null, member, admin]) {
      for (const call of ["select claim_emails(10)", "select finish_emails('{}', '{}')", "select check_email_secret('x')", `select set_email_updates('${member}', false)`])
        await expect(h.as(who, call)).rejects.toThrow(/permission denied/);
      await expect(h.as(who, "select * from private.email_outbox")).rejects.toThrow(/permission denied/);
      await expect(h.as(who, "select * from private.settings")).rejects.toThrow(/permission denied/);
    }
  });
  it("is retried, then given up on", async () => {
    const { admin, club } = await readingClub();
    await h.sql("delete from private.email_outbox");
    await meeting(admin, club);
    const claim = async () => ((await h.as("service", "select claim_emails(10) c"))[0]!.c as { id: string }[]).map((x) => x.id);
    for (let i = 0; i < 5; i++) {
      const [id] = await claim();
      expect(id).toBeTruthy();
      await h.as("service", "select finish_emails('{}', $1)", [{ [id!]: "429 daily quota" }]);
      await h.sql("update private.email_outbox set claimed_at = now() - interval '11 minutes'");
    }
    expect(await claim()).toEqual([]);
    expect(await h.sql("select attempts, failed_at is not null failed, last_error from private.email_outbox")).toEqual([{ attempts: 5, failed: true, last_error: "429 daily quota" }]);
    await meeting(admin, club);
    await h.sql("update private.email_outbox set created_at = now() - interval '3 days' where failed_at is null");
    expect(await claim()).toEqual([]); // too old to be useful
  });
  it("checks the secret it is called with", async () => {
    const [secret] = (await h.sql("select value from private.settings where key = 'email_secret'")).map((r) => r.value as string);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect((await h.as("service", "select check_email_secret($1) ok", [secret]))[0]!.ok).toBe(true);
    for (const wrong of ["", "x", secret!.toUpperCase(), `${secret}0`]) expect((await h.as("service", "select check_email_secret($1) ok", [wrong]))[0]!.ok).toBe(false);
    await expect(h.sql("select private.set_app_url('https://books.example.com/')")).rejects.toThrow(/without a path/);
    await h.sql("select private.set_app_url('https://books.example.com')");
  });
});

describe("the clock", () => {
  it("moves every club past its deadlines without anyone looking", async () => {
    const v = await h.votingClub(2, 2);
    const other = await h.votingClub(2, 2);
    await h.rpc(v.people[0]!, "submit_ballot", { p_cycle_id: v.cycle, p_ranking: v.nominations });
    await h.sql("update reading_cycles set voting_closes_at = voting_opens_at + interval '1 millisecond' where id = any ($1)", [[v.cycle, other.cycle]]);
    await h.sql("select private.tick()");
    const status = async (id: string) => (await h.cycleRow(id)).status;
    expect(await status(v.cycle)).toBe("reading"); // one ballot: a winner
    expect(await status(other.cycle)).toBe("awaiting_decision"); // nobody voted
    expect((await h.sql("select type from activity_events where reference_id = $1", [other.cycle])).map((r) => r.type)).toContain("decision_needed");
    await h.sql("select private.tick()"); // and again is harmless
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
    expect(await h.sql("select proname from pg_proc where pronamespace = 'public'::regnamespace and has_function_privilege('anon', oid, 'execute') order by 1")).toEqual([{ proname: "calendar_feed" }, { proname: "preview_invitation" }]);
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
