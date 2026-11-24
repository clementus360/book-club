import { describe, expect, it } from "vitest";
import { imageSrc } from "@/lib/images";
import { isPublicAddress } from "@/lib/net";

describe("where pictures load from", () => {
  it("loads providers' covers directly", () => {
    expect(imageSrc("https://covers.openlibrary.org/b/id/1-L.jpg")).toBe("https://covers.openlibrary.org/b/id/1-L.jpg");
    expect(imageSrc("https://image.tmdb.org/t/p/w500/x.jpg")).toBe("https://image.tmdb.org/t/p/w500/x.jpg");
  });
  it("fetches anything pasted in through the server", () => {
    expect(imageSrc("https://tracker.example/pixel.png?who=1")).toBe("/api/image?u=https%3A%2F%2Ftracker.example%2Fpixel.png%3Fwho%3D1");
    expect(imageSrc("https://covers.openlibrary.org.evil.example/x.jpg")).toMatch(/^\/api\/image\?u=/);
  });
  it("shows nothing that is not https", () => {
    for (const bad of ["http://example.com/x.png", "javascript:alert(1)", "data:image/png;base64,AA", "not a url", null, ""]) expect(imageSrc(bad)).toBeNull();
  });
});

describe("addresses the image fetcher may reach", () => {
  it("allows the public internet", () => {
    for (const ok of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) expect(isPublicAddress(ok)).toBe(true);
  });
  it("refuses everything private or special", () => {
    for (const bad of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "224.0.0.1", "not an ip"]) {
      expect(isPublicAddress(bad), bad).toBe(false);
    }
  });
});
