import { expect, test, type Page } from "@playwright/test";
import { createClub, invite, joinViaInvite, person, signUp } from "./helpers";

async function arrange(page: Page, title: string) {
  await page.goto("/app/meetings/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Date and start time").fill(`${new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10)}T19:00`);
  await page.getByRole("button", { name: "Arrange the meeting" }).click();
  await page.waitForURL(/meetings\/[0-9a-f-]{36}$/);
}
const badge = (page: Page, text: string | null) => {
  const link = page.locator("a[href='/app/notifications']").filter({ visible: true });
  return text ? expect(link).toContainText(`${text} unread`) : expect(link).not.toContainText("unread");
};
const marks = (page: Page) => page.getByRole("button", { name: /^Mark as read: / });

test("notifications can be read one at a time, by opening, or all at once", async ({ browser }) => {
  test.setTimeout(120_000);
  const problems: string[] = [];
  const [a, b] = [await person(browser, problems), await person(browser, problems)];
  await signUp(a, "Ada");
  await createClub(a, "News");
  await joinViaInvite(b, "Ben", await invite(a), "News");
  for (const t of ["One", "Two", "Three", "Four"]) await arrange(a, t);
  await b.goto("/app/notifications");
  await badge(b, "4");
  await expect(b.getByRole("link", { name: /Ada arranged a meeting: Four/ })).toBeVisible();
  await expect(marks(b)).toHaveCount(4);

  // One, without opening it: at once, kept after a reload, focus not lost.
  await b.getByRole("button", { name: "Mark as read: Ada arranged a meeting: Four" }).click();
  await expect(marks(b)).toHaveCount(3);
  await badge(b, "3");
  await expect(b.getByRole("link", { name: /meeting: Four/ })).toBeFocused();
  await expect(b.getByText("Marked as read.", { exact: true })).toBeAttached();
  await b.reload();
  await expect(marks(b)).toHaveCount(3);
  await badge(b, "3");

  // By opening it, and the mark is gone on coming back.
  await b.getByRole("link", { name: /meeting: Three/ }).click();
  await expect(b.getByRole("heading", { level: 1, name: "Three" })).toBeVisible();
  await badge(b, "2");
  await b.goBack();
  await expect(marks(b)).toHaveCount(2);
  await badge(b, "2");

  // In a new tab, this page keeps up.
  const [tab] = await Promise.all([b.context().waitForEvent("page"), b.getByRole("link", { name: /meeting: Two/ }).click({ modifiers: ["ControlOrMeta"] })]);
  await expect(tab.getByRole("heading", { level: 1, name: "Two" })).toBeVisible();
  await tab.close();
  await expect(marks(b)).toHaveCount(1);
  await badge(b, "1");

  // All: only what was on the page. Something arriving since stays unread.
  await arrange(a, "Five");
  await b.getByRole("button", { name: "Mark all as read" }).click();
  await expect(b.getByRole("button", { name: "Mark as read: Ada arranged a meeting: Five" })).toBeVisible();
  await expect(marks(b)).toHaveCount(1);
  await badge(b, "1");
  await b.getByRole("button", { name: "Mark all as read" }).click();
  await expect(marks(b)).toHaveCount(0);
  await expect(b.getByRole("button", { name: "Mark all as read" })).toHaveCount(0);
  await badge(b, null);
  await b.reload();
  await expect(b.getByRole("link", { name: /meeting: Five/ })).toBeVisible();
  await expect(marks(b)).toHaveCount(0);
  await badge(b, null);

  // The menu hears about news on coming back to the tab, without a reload.
  await b.goto("/app/members");
  await badge(b, null);
  await arrange(a, "Six");
  await b.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await badge(b, "1");

  // If it cannot be saved, the mark comes back and it says so.
  await b.goto("/app/notifications");
  await b.route("**/app/notifications", (r) => (r.request().method() === "POST" ? r.abort() : r.continue()));
  await marks(b).click();
  await expect(b.getByText("That could not be saved. Please try again.")).toBeVisible();
  await expect(marks(b)).toHaveCount(1);
  await badge(b, "1");
  await b.unroute("**/app/notifications");

  // Nobody can mark anyone else's.
  const href = (await b.getByRole("link", { name: /meeting: Six/ }).getAttribute("href"))!;
  await a.goto(href);
  await b.reload();
  await expect(marks(b)).toHaveCount(1);
  expect(problems).toEqual([]);
});

test("on a phone, marking as read is one tap", async ({ browser }) => {
  const problems: string[] = [];
  const a = await person(browser, problems);
  await signUp(a, "Ada");
  await createClub(a, "Pocket");
  const b = await (await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true })).newPage();
  await joinViaInvite(b, "Ben", await invite(a), "Pocket");
  await arrange(a, "A long title for an evening at the house by the lake");
  await arrange(a, "Two");
  await b.goto("/app/notifications");
  expect(await b.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const box = (await marks(b).first().boundingBox())!;
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  if (process.env.SHOT_DIR) await b.screenshot({ path: `${process.env.SHOT_DIR}/phone.png` });
  await marks(b).first().tap();
  await expect(marks(b)).toHaveCount(1);
  await b.getByRole("button", { name: "Mark all as read" }).tap();
  await expect(marks(b)).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("a long list can be followed back, and all of it cleared", async ({ browser }) => {
  const problems: string[] = [];
  const a = await person(browser, problems);
  const address = await signUp(a, "Ada");
  await createClub(a, "Busy");
  await a.request.post(`http://127.0.0.1:54399/emulator/notify?n=120&email=${encodeURIComponent(address)}`);
  await a.goto("/app/notifications");
  await badge(a, "99+");
  await expect(marks(a)).toHaveCount(50);
  await a.getByRole("link", { name: "Show older" }).click();
  await expect(marks(a)).toHaveCount(100);
  await marks(a).first().click();
  await expect(marks(a)).toHaveCount(99);
  await a.getByRole("link", { name: "Show older" }).click();
  await expect(marks(a)).toHaveCount(119);
  await expect(a.getByRole("link", { name: "Show older" })).toHaveCount(0);
  await a.goto("/app/notifications");
  await a.getByRole("button", { name: "Mark all as read" }).click();
  await expect(marks(a)).toHaveCount(0);
  await badge(a, null);
  await a.goto("/app/notifications?show=150");
  await expect(a.getByRole("link", { name: /Voting opened/ })).toHaveCount(120);
  await expect(marks(a)).toHaveCount(0);
  expect(problems).toEqual([]);
});
