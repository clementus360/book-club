import { describe, expect, it } from "vitest";
import { calendarFile, googleEvent, outlookEvent, subscribeUrl, type FeedMeeting } from "@/lib/calendar";
import { answeredAll, rankTimes, type PollAnswer } from "@/lib/poll";

const event = { title: "Café & talk + cake", club: "Us", starts_at: "2026-12-01T23:00:00+00:00", location: "12 Acacia Lane, Kigali", url: "https://x.test/app/meetings/1" };

describe("one meeting", () => {
  it("opens filled in, in Google", () => {
    const u = new URL(googleEvent(event));
    expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(u.searchParams.get("dates")).toBe("20261201T230000Z/20261202T010000Z");
    expect(u.searchParams.get("text")).toBe(event.title);
    expect(u.searchParams.get("location")).toBe(event.location);
    expect(u.searchParams.get("details")).toBe("Us\n\nhttps://x.test/app/meetings/1");
  });
  it("opens filled in, in either Outlook, without plus signs for spaces", () => {
    for (const [kind, host] of [["personal", "outlook.live.com"], ["work", "outlook.office.com"]] as const) {
      const u = new URL(outlookEvent(event, kind));
      expect(u.host).toBe(host);
      expect(u.searchParams.get("startdt")).toBe("2026-12-01T23:00:00.000Z");
      expect(u.searchParams.get("enddt")).toBe("2026-12-02T01:00:00.000Z");
      expect(u.searchParams.get("subject")).toBe(event.title);
      expect(u.search).not.toContain("+");
    }
  });
});

describe("all meetings", () => {
  const feed = "https://x.test/calendar/abc.ics";
  it("are followed, not downloaded", () => {
    expect(subscribeUrl("apple", feed)).toBe("webcal://x.test/calendar/abc.ics");
    expect(new URL(subscribeUrl("google", feed)).searchParams.get("cid")).toBe("webcal://x.test/calendar/abc.ics");
    expect(new URL(subscribeUrl("outlook", feed)).searchParams.get("url")).toBe(feed);
    expect(new URL(subscribeUrl("work", feed)).host).toBe("outlook.office.com");
  });
  const m: FeedMeeting = { id: "1", club: "Us", title: "A; b, c\\d\r\nBEGIN:VEVENT", starts_at: "2026-12-01T17:00:00.5+00:00", location: null, cancelled: false, created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:01:30Z" };
  it("make a valid file", () => {
    const text = calendarFile([m, { ...m, id: "2", title: "Over", cancelled: true, location: "Here\nthere" }], "https://x.test");
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const lines = text.replace(/\r\n /g, "").split("\r\n");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(2);
    expect(lines).toContain("SUMMARY:A\\; b\\, c\\\\d\\nBEGIN:VEVENT");
    expect(lines).toContain("DTSTART:20261201T170000Z");
    expect(lines).toContain("DTEND:20261201T190000Z");
    expect(lines).toContain("SEQUENCE:90");
    expect(lines).toContain("STATUS:CANCELLED");
    expect(lines).toContain("LOCATION:Here\\nthere");
    expect(lines.filter((l) => l.startsWith("LOCATION"))).toHaveLength(1);
    expect(calendarFile([], "https://x.test")).toMatch(/^BEGIN:VCALENDAR\r\n[\s\S]+END:VCALENDAR\r\n$/);
  });
  it("fold long lines at 75 bytes without breaking characters", () => {
    const title = "本を読む会📚".repeat(20);
    const text = calendarFile([{ ...m, title }], "https://x.test");
    for (const line of text.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(text.replace(/\r\n /g, "")).toContain(`SUMMARY:${title}`);
  });
});

describe("which time suits", () => {
  const times = ["a", "b", "c"].map((id, i) => ({ id, starts_at: `2026-12-0${i + 1}T17:00:00Z` }));
  const say = (time_id: string, user_id: string, answer: PollAnswer) => ({ time_id, user_id, answer });
  it("puts the one most people can come to first", () => {
    const list = rankTimes(times, [say("a", "1", "yes"), say("a", "2", "no"), say("b", "1", "if_needed"), say("b", "2", "yes"), say("c", "1", "yes"), say("c", "2", "yes")], ["1", "2"]);
    expect(list.map((t) => [t.id, t.best])).toEqual([["c", true], ["b", false], ["a", false]]);
  });
  it("marks ties, prefers the sooner, and ignores people who have left", () => {
    const list = rankTimes(times, [say("b", "1", "yes"), say("c", "1", "yes"), say("a", "gone", "yes")], ["1"]);
    expect(list.map((t) => [t.id, t.best])).toEqual([["b", true], ["c", true], ["a", false]]);
    expect(rankTimes(times, [say("a", "1", "no")], ["1"]).some((t) => t.best)).toBe(false);
  });
  it("counts people once they have answered for every time", () => {
    expect(answeredAll(times, [say("a", "1", "no"), say("b", "1", "no"), say("c", "1", "no"), say("a", "2", "yes")], ["1", "2"])).toEqual(["1"]);
  });
});
