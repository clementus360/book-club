import { describe, expect, it, vi } from "vitest";
import { explain, isUuid, safeNext } from "@/lib/action";
import { fromNow, isTimeZone, utcToZonedInput, zonedToUtc } from "@/lib/dates";

describe("time zones", () => {
  it("converts wall-clock times", () => {
    expect(zonedToUtc("2026-03-01T19:30", "Africa/Kigali")).toBe("2026-03-01T17:30:00.000Z");
    expect(zonedToUtc("2026-07-01T09:00", "America/New_York")).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedToUtc("2026-01-01T09:00", "America/New_York")).toBe("2026-01-01T14:00:00.000Z");
    expect(zonedToUtc("2026-01-01T00:15", "Asia/Kathmandu")).toBe("2025-12-31T18:30:00.000Z");
  });
  it("handles times around a clock change", () => {
    expect(zonedToUtc("2026-03-29T00:30", "Europe/London")).toBe("2026-03-29T00:30:00.000Z");
    expect(zonedToUtc("2026-03-29T03:00", "Europe/London")).toBe("2026-03-29T02:00:00.000Z");
  });
  it("round-trips", () => {
    for (const zone of ["UTC", "Asia/Tokyo", "America/Sao_Paulo", "Europe/Paris"]) {
      expect(utcToZonedInput(zonedToUtc("2026-11-22T18:45", zone)!, zone)).toBe("2026-11-22T18:45");
    }
  });
  it("rejects nonsense", () => {
    expect(zonedToUtc("2026-02-31T10:00", "UTC")).toBeNull();
    expect(zonedToUtc("tomorrow", "UTC")).toBeNull();
    expect(zonedToUtc(null, "UTC")).toBeNull();
    expect(zonedToUtc("2026-01-01T10:00", "Middle/Earth")).toBeNull();
    expect(isTimeZone("Asia/Seoul")).toBe(true);
  });
  it("describes distance", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    expect(fromNow("2026-01-13T12:00:00Z", now)).toBe("in 3 days");
    expect(fromNow("2026-01-10T11:00:00Z", now)).toBe("1 hour ago");
  });
});

describe("safety helpers", () => {
  it("only follows paths inside the app", () => {
    expect(safeNext("/app/meetings?x=1")).toBe("/app/meetings?x=1");
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
    for (const bad of ["https://evil.test", "//evil.test", "/app//evil.test", "/\\evil.test", "/apple", "javascript:alert(1)", null]) {
      expect(safeNext(bad)).toBe("/app");
    }
  });
  it("shows database wording only when it was written for people", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(explain({ code: "P0001", message: "Nominations are closed." })).toBe("Nominations are closed.");
    expect(explain({ code: "XX000", message: "relation secret" })).not.toContain("secret");
  });
  it("checks ids", () => {
    expect(isUuid("3f0a0d0e-4f1c-4b6e-9a59-1f2b3c4d5e6f")).toBe(true);
    expect(isUuid("1 or 1=1")).toBe(false);
  });
});
