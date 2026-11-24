import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailItem } from "@/lib/email/compose";

// The outbox, as the database would hand it out.
const calls: { fn: string; args: unknown }[] = [];
let queue: EmailItem[][] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return { data: fn === "claim_emails" ? queue.shift() ?? [] : null, error: null };
    },
  }),
}));

const item = (id: string): EmailItem => ({
  id, type: "voting_opened", user_id: "u1", email: `${id}@example.test`, name: "Ben", club_id: "c1", club: "Readers",
  timezone: "UTC", actor: null, reference_id: "r1",
  cycle: { status: "voting", nomination_closes_at: "2026-12-01T17:00:00Z", voting_closes_at: "2026-12-04T17:00:00Z", runoff_closes_at: null, book: null, authors: null },
  meeting: null, poll: null,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "Club <club@example.test>");
  vi.stubEnv("SITE_URL", "https://books.test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  calls.length = 0;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function run() {
  const { sendPendingEmail } = await import("@/lib/email/send");
  const done = sendPendingEmail();
  await vi.runAllTimersAsync();
  return done;
}

describe("sending email within Resend's limits", () => {
  it("puts the rest back, uncounted, when the daily quota is reached", async () => {
    queue = [[item("a"), item("b"), item("c")]];
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n === 1 ? new Response("{}", { status: 200 }) : new Response('{"name":"daily_quota_exceeded"}', { status: 429 }))));
    expect(await run()).toEqual({ sent: 1, failed: 0, deferred: 2 });
    expect(calls.find((c) => c.fn === "finish_emails")!.args).toEqual({ p_sent: ["a"], p_failed: {} });
    expect(calls.find((c) => c.fn === "release_emails")!.args).toEqual({ p_ids: ["b", "c"] });
    expect(n).toBe(2); // stops asking once told no
  });
  it("waits and tries again when sending too fast", async () => {
    queue = [[item("a")]];
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n === 1 ? new Response('{"name":"rate_limit_exceeded"}', { status: 429, headers: { "retry-after": "1" } }) : new Response("{}", { status: 200 }))));
    expect(await run()).toEqual({ sent: 1, failed: 0, deferred: 0 });
    expect(calls.some((c) => c.fn === "release_emails")).toBe(false);
  });
  it("records other failures as attempts", async () => {
    queue = [[item("a")]];
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad address", { status: 422 })));
    expect(await run()).toEqual({ sent: 0, failed: 1, deferred: 0 });
    expect(calls.find((c) => c.fn === "finish_emails")!.args).toEqual({ p_sent: [], p_failed: { a: "422 bad address" } });
  });
});
