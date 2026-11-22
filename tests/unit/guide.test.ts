import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cacheKey, worthSearching } from "@/lib/books/live-search";
import { nextStep, stepOf, type GuideInput } from "@/lib/guide";
import { helpFor } from "@/lib/help";
import { HINTS, hintFor } from "@/lib/hints";
import { PLAIN } from "@/lib/plain";

const base: GuideInput = { status: null, isAdmin: false, members: 3, everRead: false, nominations: 0, iNominated: false, votes: 0, iVoted: false, deadline: null, myProgress: null, meeting: null, met: false, iReviewed: false };
const step = (over: Partial<GuideInput>) => nextStep({ ...base, ...over });
const soon = new Date(Date.now() + 3 * 864e5).toISOString();

describe("what to do now", () => {
  it.each([
    ["alone", { members: 1, isAdmin: true }, "Invite your friends"],
    ["between books, administrator", { isAdmin: true }, "Choose your first book"],
    ["between books again", { isAdmin: true, everRead: true }, "Choose your next book"],
    ["between books, member", {}, "Nothing to do just now"],
    ["nominating", { status: "nominating" }, "Nominate a book"],
    ["nominated", { status: "nominating", iNominated: true, nominations: 1 }, "You have nominated. Now wait for the others"],
    ["all nominated, member", { status: "nominating", iNominated: true, nominations: 3 }, "You have nominated. Now wait for the others"],
    ["all nominated, administrator", { status: "nominating", iNominated: true, nominations: 3, isAdmin: true }, "Everyone has nominated"],
    ["one nomination, administrator", { status: "nominations_closed", nominations: 1, isAdmin: true }, "The club needs you to decide"],
    ["voting", { status: "voting" }, "Vote for the next book"],
    ["tie", { status: "runoff" }, "Vote again to break the tie"],
    ["voted", { status: "voting", iVoted: true, votes: 2 }, "You have voted. Now wait for the others"],
    ["all voted, administrator", { status: "voting", iVoted: true, votes: 3, isAdmin: true }, "Everyone has voted"],
    ["undecided, member", { status: "awaiting_decision" }, "Waiting for a decision"],
    ["reading, no meeting, administrator", { status: "reading", isAdmin: true }, "Arrange a meeting"],
    ["looking for a date", { status: "reading", poll: { id: "x", answered: false, everyone: false } }, "When can you meet?"],
    ["date answered, member", { status: "reading", poll: { id: "x", answered: true, everyone: true } }, "Enjoy the book"],
    ["date answered by all, administrator", { status: "reading", isAdmin: true, poll: { id: "x", answered: true, everyone: true } }, "Everyone has answered"],
    ["date being answered, administrator", { status: "reading", isAdmin: true, poll: { id: "x", answered: true, everyone: false } }, "Enjoy the book"],
    ["reading, no meeting, member", { status: "reading" }, "Enjoy the book"],
    ["unanswered meeting", { status: "reading", meeting: { id: "m", title: "Supper", answered: false, startsAt: soon } }, "Are you coming to the meeting?"],
    ["answered meeting", { status: "reading", meeting: { id: "m", title: "Supper", answered: true, startsAt: soon } }, "Enjoy the book"],
    ["finished reading", { status: "reading", myProgress: "finished" }, "You have finished the book"],
    ["met", { status: "reading", met: true }, "Say what you thought"],
    ["met and reviewed, administrator", { status: "reading", met: true, iReviewed: true, isAdmin: true }, "Finish this book when you are ready"],
  ] as [string, Partial<GuideInput>, string][])("%s", (_, input, title) => expect(step(input).title).toBe(title));

  it("never sends an ordinary member to an administrator's control", () => {
    for (const status of [null, "scheduled", "nominating", "nominations_closed", "voting", "runoff", "awaiting_decision", "reading"] as const) {
      for (const flag of [true, false]) {
        const s = step({ status, iNominated: flag, iVoted: flag, nominations: 3, votes: 3, met: flag, iReviewed: flag });
        expect(s.action?.href ?? "", `${status}`).not.toMatch(/#manage|meetings\/new/);
      }
    }
  });
  it("says waiting only when nothing is required", () => {
    expect(step({ status: "voting" }).waiting).toBeUndefined();
    expect(step({ status: "voting", iVoted: true }).waiting).toBe(true);
  });
  it("places the club on the right step", () => {
    expect([stepOf(null, false), stepOf("nominating", false), stepOf("runoff", false), stepOf("reading", false), stepOf("reading", true)]).toEqual([null, 0, 1, 2, 3]);
  });
});

describe("plain words", () => {
  const sql = readdirSync("supabase/migrations").map((f) => readFileSync(`supabase/migrations/${f}`, "utf8")).join("\n");
  const raised = [...sql.matchAll(/private\.fail\('((?:[^']|'')*)'\)/g)].map((m) => m[1]!.replace(/''/g, "'"));
  const JARGON = /\b(cycles?|ballots?|runoff)\b/i;
  it("translates every formal message the database can raise", () => {
    expect(raised.length).toBeGreaterThan(40);
    expect(raised.filter((m) => JARGON.test(m) && !PLAIN[m])).toEqual([]);
    expect(Object.keys(PLAIN).filter((k) => !raised.includes(k))).toEqual([]);
  });
  it("uses none of that vocabulary itself", () => {
    expect(Object.values(PLAIN).filter((m) => JARGON.test(m))).toEqual([]);
    expect(Object.values(HINTS).filter((h) => JARGON.test(h.text))).toEqual([]);
  });
});

describe("hints and help", () => {
  it("finds hints by label, including ones with names in them", () => {
    expect(hintFor("Going (your answer)")?.text).toContain("coming");
    expect(hintFor("Move Kindred up")?.text).toContain("higher");
    expect(hintFor("constructor")).toBeNull();
  });
  it("has help for each page", () => {
    expect(helpFor("/app/meetings/new").title).toBe("Arranging a meeting");
    expect(helpFor("/app/archive/abc").title).toBe("A book you have read");
    expect(helpFor("/app/unknown").todo.length).toBeGreaterThan(0);
  });
});

describe("searching while typing", () => {
  it.each([["", false], ["du", false], ["dun", true], ["三", false], ["三体", true], ["1984", true], ["97804", false], ["9780441478125", true], ["978-0-441-47812-5", true], ["9780441478126", false], ["L'É", true]])(
    "%s -> %s", (q, expected) => expect(worthSearching(q)).toBe(expected));
  it("treats the same words as the same search", () => expect(cacheKey("  Left   HAND ")).toBe(cacheKey("left hand")));
});
