import { describe, expect, it } from "vitest";
import { compose, type EmailItem } from "@/lib/email/compose";

const base: EmailItem = {
  id: "n1", type: "voting_opened", user_id: "u1", email: "ben@example.test", name: "Ben", club_id: "c1", club: "Tuesday <Readers>",
  timezone: "Africa/Kigali", actor: "Ada", reference_id: "r1",
  cycle: { status: "voting", nomination_closes_at: "2026-12-01T17:00:00Z", voting_closes_at: "2026-12-04T17:00:00Z", runoff_closes_at: null, book: null, authors: null },
  meeting: null, poll: null,
};
const mail = (over: Partial<EmailItem>) => compose({ ...base, ...over }, "https://books.test", "https://books.test/email/stop?u=u1&s=x")!;

describe("milestone emails", () => {
  it("say what to do, by when, in the club's time, with one link into the right club", () => {
    const e = mail({});
    expect(e.subject).toBe("Tuesday <Readers>: Voting is open");
    expect(e.text).toContain("Voting closes Friday 4 December, 19:00 (Kigali (GMT+2)).");
    expect(e.text).toContain("Vote now: https://books.test/app/go?club=c1&to=%2Fapp%2Fselection%23vote");
    expect(e.text).toContain("To stop these emails: https://books.test/email/stop?u=u1&s=x");
  });
  it("escape everything people typed", () => {
    const e = mail({ type: "meeting_created", name: "<b>Ben</b>", actor: "Ada & co", meeting: { title: "Supper <script>", starts_at: "2026-12-05T16:30:00Z", timezone: "Africa/Kigali", location: "12 \"Acacia\" Lane\nKigali" } });
    expect(e.html).not.toMatch(/<script>|<b>Ben|<Readers>/);
    expect(e.html).toContain("Supper &lt;script&gt;");
    expect(e.html).toContain("Ada &amp; co arranged a meeting.");
    expect(e.text).toContain("Where: 12 \"Acacia\" Lane Kigali");
    expect(e.subject).not.toMatch(/[\r\n]/);
  });
  it("name the chosen book", () => {
    const e = mail({ type: "book_selected", cycle: { ...base.cycle!, status: "reading", book: "Kindred", authors: ["Octavia E. Butler"] } });
    expect(e.subject).toBe("Tuesday <Readers>: Voting is over: Kindred");
    expect(e.text).toContain("The club is reading Kindred by Octavia E. Butler.");
  });
  it("cover every milestone the database queues, and nothing else", () => {
    for (const type of ["nominations_opened", "nominations_reopened", "nominations_closed", "voting_opened", "voting_reopened", "runoff_opened", "decision_needed", "book_selected", "cycle_cancelled", "poll_opened", "meeting_created", "meeting_updated", "meeting_cancelled"]) {
      const e = compose({ ...base, type, meeting: { title: "M", starts_at: "2026-12-05T16:30:00Z", timezone: "UTC", location: null }, poll: { title: "P" } }, "https://b.test", "https://b.test/s");
      expect(e?.subject, type).toBeTruthy();
      expect(e!.text, type).not.toContain("undefined");
      expect(e!.text, type).not.toContain("null");
    }
    expect(compose({ ...base, type: "book_nominated" }, "https://b.test", "x")).toBeNull();
    expect(compose({ ...base, type: "meeting_created", meeting: null }, "https://b.test", "x")).toBeNull(); // gone since
  });
});
