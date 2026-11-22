import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { googleAuth, secretKey, siteUrl, supabaseKey, supabaseUrl } from "@/lib/env";

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; });
const source = files("src").filter((f) => /\.tsx?$/.test(f)).map((f) => [f, readFileSync(f, "utf8")] as const);

describe("configuration", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("prefers plain names and still accepts the prefixed ones", () => {
    for (const n of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "SITE_URL", "GOOGLE_AUTH"]) vi.stubEnv(n, "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "old-url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "old-key");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://old.test/");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_AUTH", "1");
    expect([supabaseUrl(), supabaseKey(), siteUrl(), googleAuth()]).toEqual(["old-url", "old-key", "https://old.test", true]);
    vi.stubEnv("SUPABASE_URL", "new-url");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "new-key");
    expect([supabaseUrl(), supabaseKey()]).toEqual(["new-url", "new-key"]);
  });
  it("never accepts a secret under a public name", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_SECRET_KEY", "leaked");
    expect(() => secretKey()).toThrow(/SUPABASE_SECRET_KEY is not set/);
  });
  it("is never read by code that runs in the browser", () => {
    const browser = source.filter(([, text]) => /^["']use client["']/.test(text));
    expect(browser.length).toBeGreaterThan(5);
    expect(browser.filter(([, t]) => /process\.env|lib\/env|lib\/supabase/.test(t)).map(([f]) => f)).toEqual([]);
    expect(source.filter(([, t]) => /NEXT_PUBLIC_\w*(SECRET|SERVICE_ROLE|API_KEY)/.test(t)).map(([f]) => f)).toEqual([]);
  });
});
