import { expect, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

export const PASSWORD = "a long enough password";
export const email = (name: string) => `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.test`;

/** A separate browser session that fails the test on console errors and crashes. */
export async function person(browser: Browser, problems: string[]): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|ERR_|covers\.openlibrary/.test(m.text())) problems.push(`${page.url()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`${page.url()}: ${e.message}`));
  return page;
}

export async function signUp(page: Page, name: string, at = "/signup", address = email(name)) {
  await page.goto(at);
  if (!page.url().includes("/signup")) await page.getByRole("link", { name: "Create an account to join" }).click();
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signup"));
  return address;
}

export async function createClub(page: Page, name: string) {
  await page.goto("/onboarding");
  await page.getByLabel("Name of the club").fill(name);
  await page.getByRole("button", { name: "Create the club" }).click();
  await page.waitForURL((u) => u.pathname === "/app");
  await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
}

export async function invite(page: Page): Promise<string> {
  await page.goto("/app/members");
  await page.getByRole("button", { name: "Invite someone" }).click();
  await page.getByRole("button", { name: "Make an invitation link" }).click();
  const link = await page.getByLabel("Invitation link").inputValue();
  return new URL(link).pathname;
}

export async function joinViaInvite(page: Page, name: string, path: string, clubName: string) {
  const address = await signUp(page, name, path);
  await page.waitForURL(/\/invite\//);
  await page.getByRole("button", { name: "Join the club" }).click();
  await page.waitForURL((u) => u.pathname === "/app");
  await expect(page.getByRole("heading", { level: 1, name: clubName, exact: true })).toBeVisible();
  return address;
}

export async function findBook(page: Page, query: string, title: string | RegExp) {
  await page.getByLabel("Title, author or ISBN, in any language").fill(query);
  await page.getByRole("button", { name: title }).first().click();
}

export async function addToMyLibrary(page: Page, query: string, title: string, status = "Read") {
  await page.goto("/app/add-book");
  await findBook(page, query, new RegExp(title));
  await page.getByRole("radio", { name: status, exact: true }).check();
  await page.getByRole("button", { name: "Add to my books" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

export async function nominate(page: Page, query: string, title: string, why?: string) {
  await page.goto("/app/add-book?to=nominate");
  await findBook(page, query, new RegExp(title));
  if (why) await page.getByLabel("Why this book? (optional)").fill(why);
  await page.getByRole("button", { name: "Nominate this book" }).click();
  await page.waitForURL("**/app/selection");
  await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
}

/** Submits a ballot in the given order. */
export async function rank(page: Page, titles: string[]) {
  await page.goto("/app/selection");
  for (const [target, title] of titles.entries()) {
    for (let i = 0; i < 6; i++) {
      const shown = await page.locator("#vote ol li span.font-serif.text-lg").allTextContents();
      if (shown.indexOf(title) <= target) break;
      await page.getByRole("button", { name: `Move ${title} up` }).click();
    }
  }
  await expect(page.locator("#vote ol li span.font-serif.text-lg")).toHaveText(titles);
  await page.getByRole("button", { name: /Send my vote|Update my vote/ }).click();
  await expect(page.getByRole("heading", { name: "Your vote" })).toBeVisible();
}

export async function startCycle(page: Page) {
  await page.goto("/app/selection");
  await page.getByRole("button", { name: "Start choosing a book" }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Nominate a book" })).toBeVisible();
}

export async function confirmIn(page: Page, trigger: string, submit: string) {
  await page.getByRole("button", { name: trigger, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: submit, exact: true }).click();
}
