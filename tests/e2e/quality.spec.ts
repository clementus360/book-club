import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { addToMyLibrary, confirmIn, createClub, invite, joinViaInvite, nominate, person, rank, signUp, startCycle } from "./helpers";

const SHOTS = process.env.E2E_SHOTS;

async function check(page: Page, name: string) {
  // Not the loading skeleton: the page itself.
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  await expect(page.locator("h1").first()).toBeAttached();
  if (page.url().includes("current-book") || name.includes("current-book")) await page.waitForLoadState("networkidle");
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect.soft(axe.violations.map((v) => `${name}: ${v.id} ${v.nodes.slice(0, 2).map((n) => n.html.slice(0, 160)).join(" | ")}`)).toEqual([]);
  expect.soft(await page.locator("h1").count(), `${name} has one h1`).toBe(1);
  expect.soft(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${name} does not scroll sideways`).toBe(0);
}

test("every page is accessible, fits a phone and a desktop, and has working links", async ({ browser }) => {
  test.setTimeout(400_000);
  const problems: string[] = [];
  const [a, b] = [await person(browser, problems), await person(browser, problems)];
  await signUp(a, "Ada");
  await createClub(a, "The Very Long-Named Society for Unhurried Reading");
  await joinViaInvite(b, "Ben", await invite(a), "The Very Long-Named Society for Unhurried Reading");
  await addToMyLibrary(a, "left hand", "The Left Hand of Darkness");
  const book = new URL(a.url()).pathname;
  await a.getByRole("button", { name: "Recommend to club" }).click();
  await a.getByRole("dialog").getByRole("button", { name: "Recommend", exact: true }).click();
  await expect(a.getByRole("dialog")).toHaveCount(0);
  await startCycle(a);
  await nominate(a, "left hand", "The Left Hand of Darkness");
  await nominate(b, "kindred", "Kindred", "Essential.");
  await a.goto("/app/meetings/new");
  await a.getByLabel("Title").fill("First supper");
  await a.getByLabel("Date and start time").fill(`${new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)}T19:00`);
  await a.getByRole("button", { name: "Arrange the meeting" }).click();
  await a.waitForURL(/meetings\/[0-9a-f-]{36}$/);
  const meeting = new URL(a.url()).pathname;

  const sweep = async (label: string, paths: string[]) => {
    for (const size of [{ width: 1280, height: 900 }, { width: 360, height: 740 }]) {
      await a.setViewportSize(size);
      for (const path of paths) {
        await a.goto(path);
        await a.waitForLoadState("load");
        await check(a, `${label} ${path} @${size.width}`);
        if (SHOTS && size.width === 360) await a.screenshot({ path: `${SHOTS}/m-${label}-${path.replace(/[^a-z]+/gi, "-").slice(0, 40)}.png` });
      }
    }
    await a.setViewportSize({ width: 1280, height: 900 });
  };

  const app = ["/app", "/app/my-library", "/app/recommendations", "/app/recommendations?view=made", "/app/library", "/app/selection", "/app/current-book", "/app/meetings",
    "/app/archive", "/app/members", "/app/settings", "/app/account", "/app/notifications", "/app/help", "/app/add-book", "/app/add-book?to=club", book, meeting, `${meeting}/edit`, "/app/meetings/new", "/onboarding"];
  await sweep("nominating", app);

  // Every link on every page leads somewhere.
  const seen = new Set<string>(), broken: string[] = [];
  for (const path of app) {
    await a.goto(path);
    await expect(a.getByRole("status", { name: "Loading" })).toHaveCount(0);
    await a.waitForLoadState("networkidle"); // "Our book" hands over to choosing one
    for (const href of await a.locator("a[href^='/']").evaluateAll((as) => as.map((x) => x.getAttribute("href")!))) seen.add(href.split("#")[0]!);
  }
  for (const href of seen) {
    const res = await a.request.get(href);
    if (!res.ok()) broken.push(`${href} ${res.status()}`);
  }
  expect(broken).toEqual([]);

  await a.goto("/app/selection");
  await confirmIn(a, "Start the vote now", "Start the vote");
  await rank(a, ["Kindred", "The Left Hand of Darkness"]);
  await sweep("voting", ["/app/selection", "/app"]);
  await a.goto("/app/selection");
  await confirmIn(a, "Count the votes now", "Close and count");
  await expect(a.getByRole("heading", { level: 1, name: "How we chose" })).toBeVisible();
  await sweep("reading", ["/app", "/app/current-book", "/app/selection"]);
  await a.goto("/app/current-book");
  await confirmIn(a, "Finish this book", "Finish it");
  await a.waitForURL(/archive\/.+/);
  await sweep("archived", ["/app/archive", new URL(a.url()).pathname, "/app/current-book", "/app/library"]);

  // Dialogs are named, trap focus, close on Escape and give focus back.
  await a.goto("/app/members");
  const trigger = a.getByRole("button", { name: "Invite someone" });
  await trigger.focus();
  await a.keyboard.press("Enter");
  await expect(a.getByRole("dialog", { name: /Invite someone/ })).toBeVisible();
  await check(a, "dialog");
  await a.keyboard.press("Escape");
  await expect(a.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // Phone navigation reaches everything.
  await a.setViewportSize({ width: 360, height: 740 });
  await a.goto("/app");
  await a.locator("summary").filter({ hasText: "Your menu" }).first().click();
  await expect(a.getByRole("button", { name: "Sign out" }).first()).toBeInViewport({ ratio: 1 });
  await check(a, "phone account menu");
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/look-phone.png` });
  await a.keyboard.press("Escape");
  await a.locator("summary").filter({ hasText: "More" }).click();
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/m-menu.png` });
  await a.getByRole("link", { name: "Members", exact: true }).click();
  await a.waitForURL("**/app/members");
  await expect(a.getByRole("heading", { level: 1, name: "Members" })).toBeVisible();

  // Public pages, signed out.
  await a.context().clearCookies();
  await sweep("public", ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/privacy", "/terms", `/invite/${"0".repeat(64)}`, "/no-such-page"]);
  expect(problems.filter((p) => !/404/.test(p))).toEqual([]);
});
