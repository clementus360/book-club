import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { createClub, email, invite, joinViaInvite, person, signUp } from "./helpers";

const photo = async (width: number, height: number) => ({
  name: "holiday.jpg", mimeType: "image/jpeg",
  buffer: await sharp({ create: { width, height, channels: 3, background: { r: 180, g: 60, b: 40 } } }).jpeg({ quality: 95 }).toBuffer(),
});

test("a picture is chosen, shrunk, shown to the club, replaced and removed", async ({ browser, request }) => {
  const problems: string[] = [];
  const [a, b] = [await person(browser, problems), await person(browser, problems)];
  await signUp(a, "Ada");
  await createClub(a, "Faces");
  await joinViaInvite(b, "Ben", await invite(a), "Faces");
  await a.goto("/app/account");
  await a.getByText("Name and picture").click();
  await expect(a.getByRole("button", { name: "Use my Google picture" })).toHaveCount(0); // not signed in with Google

  // A big photo goes up small.
  const uploads: number[] = [];
  a.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/app/account")) uploads.push(r.postDataBuffer()?.length ?? 0); });
  await a.locator("input[type=file]").setInputFiles(await photo(3000, 2000));
  await expect(a.getByText("Picture saved.")).toBeVisible();
  expect(Math.max(...uploads)).toBeLessThan(60_000);
  const src = await a.locator("img.size-20").getAttribute("src");
  await a.reload();
  const saved = (await a.locator("main img").first().getAttribute("src"))!;
  expect(saved).toMatch(/\/storage\/v1\/object\/public\/avatars\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/);
  expect(src).toMatch(/^blob:/); // shown at once, before the round trip
  const file = await request.get(saved);
  expect(file.ok()).toBe(true);
  const meta = await sharp(await file.body()).metadata();
  expect([meta.width, meta.height]).toEqual([256, 256]);

  // The club sees it.
  await b.goto("/app/members");
  await expect(b.locator(`img[src="${saved}"]`).first()).toBeVisible();

  // Replacing it removes the old file.
  await a.getByText("Name and picture").click();
  await a.locator("input[type=file]").setInputFiles(await photo(400, 900));
  await expect(a.getByText("Picture saved.")).toBeVisible();
  await expect.poll(async () => (await request.get(saved)).status()).toBe(404);

  // Not a picture at all.
  await a.locator("input[type=file]").setInputFiles({ name: "notes.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not an image") });
  await expect(a.getByText("That picture could not be opened. Try a JPEG or PNG photo.")).toBeVisible();

  await a.getByRole("button", { name: "Remove picture" }).click();
  await expect(a.getByText("Picture removed.")).toBeVisible();
  await a.reload();
  await expect(a.locator("main img")).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("someone who signed in with Google can use that picture", async ({ browser }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "needs the emulator's stand-in for Google");
  const problems: string[] = [];
  const g = await person(browser, problems);
  await g.request.post("http://127.0.0.1:54399/emulator/google", { data: { email: email("grace"), name: "Grace Hopper" } });
  await g.goto("/login");
  await g.getByRole("link", { name: "Continue with Google" }).click();
  await g.waitForURL((u) => u.pathname === "/onboarding", { waitUntil: "load" }); // no club yet
  await g.goto("/app/account");
  await g.getByText("Name and picture").click();
  await expect(g.locator("main img")).toHaveCount(0); // never used without asking
  await g.getByRole("button", { name: "Use my Google picture" }).click();
  await expect(g.getByText("Picture saved.")).toBeVisible();
  await g.reload();
  await expect(g.locator("main img").first()).toHaveAttribute("src", "https://lh3.googleusercontent.com/x");
  expect(problems).toEqual([]);
});
