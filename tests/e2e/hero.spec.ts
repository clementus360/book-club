import { expect, test } from "@playwright/test";
import { HERO_SLIDES } from "../../src/lib/hero";

const scales = (page: import("@playwright/test").Page) => page.evaluate(() =>
  [".hero-background", ".hero-character"].map((s) => new DOMMatrix(getComputedStyle(document.querySelector(`.hero-slide[data-state=on] ${s}`)!).transform).a));

test("the hero moves at two speeds, pauses, and stays still for people who ask", async ({ browser }) => {
  const page = await browser.newPage();
  const failed: string[] = [];
  page.on("response", (r) => { if (r.url().includes("/hero/") && !r.ok()) failed.push(r.url()); });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const before = await scales(page);
  await page.waitForTimeout(3000);
  const after = await scales(page);
  expect(after[0]! - before[0]!).toBeGreaterThan(0);
  expect(after[1]! - before[1]!).toBeGreaterThan(after[0]! - before[0]!);
  await page.getByRole("button", { name: "Pause the artwork" }).click();
  await page.waitForTimeout(200);
  const held = await scales(page);
  await page.waitForTimeout(800);
  expect(await scales(page)).toEqual(held);
  await page.getByRole("button", { name: "Play the artwork" }).click();
  await page.waitForTimeout(800);
  expect(await scales(page)).not.toEqual(held);
  expect(failed).toEqual([]);
  const calm = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  await calm.goto("/");
  const still = await scales(calm);
  await calm.waitForTimeout(1000);
  expect(await scales(calm)).toEqual(still);
  await expect(calm.getByRole("button", { name: /artwork/ })).toBeHidden();
});

test("slides change by hand and by themselves, named, loaded, and only while allowed to", async ({ browser }) => {
  test.setTimeout(90_000);
  test.skip(HERO_SLIDES.length < 2, "needs several slides");
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("response", (r) => { if (r.url().includes("/hero/") && !r.ok()) problems.push(r.url()); });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const caption = page.locator(".hero-caption cite");
  const settled = () => expect(page.locator("[data-state=entering], [data-state=leaving]")).toHaveCount(0);
  await expect(caption).toHaveText(HERO_SLIDES[0]!.title);

  // It moves on by itself.
  await expect(caption).toHaveText(HERO_SLIDES[1]!.title, { timeout: 20_000 });
  await settled();
  // Paused, it stays put; a dot still works.
  await page.getByRole("button", { name: "Pause the artwork" }).click();
  await page.waitForTimeout(13_000);
  await expect(caption).toHaveText(HERO_SLIDES[1]!.title);
  for (const slide of [...HERO_SLIDES].reverse()) {
    await page.getByRole("button", { name: `Show ${slide.title}` }).click();
    await expect(caption).toHaveText(slide.title);
    await expect(page.getByRole("button", { name: `Show ${slide.title}` })).toHaveAttribute("aria-current", "true");
    await expect(page.locator(".hero-caption")).toContainText(`Photo by ${slide.credit.by} on ${slide.credit.site}`);
    // Never painted before its pictures have arrived.
    expect(await page.locator("[data-state=entering] img, [data-state=on] img").evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await settled();
    await expect(page.getByRole("img", { name: slide.alt })).toBeVisible();
  }
  // Two quick clicks end on the second one asked for.
  await page.getByRole("button", { name: `Show ${HERO_SLIDES[1]!.title}` }).click();
  await page.getByRole("button", { name: `Show ${HERO_SLIDES.at(-1)!.title}` }).click();
  await settled();
  await expect(caption).toHaveText(HERO_SLIDES.at(-1)!.title, { timeout: 8000 });
  // Nothing spills past the page on a phone.
  await page.setViewportSize({ width: 360, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  expect(problems).toEqual([]);
});
