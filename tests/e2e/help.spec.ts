import { expect, test, type Page } from "@playwright/test";
import { addToMyLibrary, confirmIn, createClub, findBook, invite, joinViaInvite, nominate, person, rank, signUp } from "./helpers";
import { hintFor } from "../../src/lib/hints";

const now = (page: Page, title: string) => expect(page.getByRole("region", { name: title })).toBeVisible();

/** Every control must be able to say what it does, and nothing may use the old vocabulary. */
async function explained(page: Page, path: string) {
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
  const labels = await page.locator("main button, main a.btn, main a.btn-text, main summary, aside button, nav[aria-label=Club] a").evaluateAll((els) =>
    els.filter((e) => !(e as HTMLElement).dataset.hint && !e.closest("dialog") && (e as HTMLElement).offsetParent !== null).map((e) => {
      const c = e.cloneNode(true) as Element;
      c.querySelectorAll(".sr-only").forEach((n) => n.remove());
      return (e.getAttribute("aria-label") ?? c.textContent ?? "").trim();
    }));
  const missing = [...new Set(labels)].filter((l) => l && !hintFor(l));
  expect.soft(missing, `${path}: controls with no explanation`).toEqual([]);
  const words = (await page.locator("body").innerText()).match(/\b(cycles?|ballots?|runoff|reading cycle)\b/gi) ?? [];
  expect.soft(words, `${path}: words people should not have to learn`).toEqual([]);
}

test("someone new is told what to do at every point, with nothing unexplained", async ({ browser }) => {
  test.setTimeout(200_000);
  const problems: string[] = [];
  const [a, b] = [await person(browser, problems), await person(browser, problems)];
  await signUp(a, "Ada");
  await explained(a, "onboarding");
  await createClub(a, "Plain Words");
  await now(a, "Invite your friends");
  await joinViaInvite(b, "Ben", await invite(a), "Plain Words");
  await now(b, "Nothing to do just now");
  await a.goto("/app");
  await now(a, "Choose your first book");
  await a.getByRole("link", { name: "Start choosing a book" }).click();
  await a.getByRole("button", { name: "Start choosing a book" }).click();
  await expect(a.getByLabel("Days to nominate")).toHaveValue("7"); // three plain questions, not six dates
  await a.getByRole("button", { name: "Set exact dates instead" }).click();
  await expect(a.getByLabel("Voting closes")).toBeVisible();
  await a.getByRole("button", { name: "Use simple lengths instead" }).click();
  await a.getByLabel("Days to vote").fill("3");
  await a.getByRole("button", { name: "Start", exact: true }).click();
  await expect(a.getByRole("heading", { level: 1, name: "Nominate a book" })).toBeVisible();
  for (const p of [a, b]) { await p.goto("/app"); await now(p, "Nominate a book"); }
  await b.getByRole("link", { name: "Nominate a book" }).click();
  await findBook(b, "kindred", /Kindred/);
  await b.getByRole("button", { name: "Nominate this book" }).click();
  await b.waitForURL("**/app/selection");
  await b.goto("/app");
  await now(b, "You have nominated. Now wait for the others");
  await nominate(a, "solaris", "Solaris");
  await a.goto("/app");
  await now(a, "Everyone has nominated");
  await explained(a, "/app nominating");
  await a.goto("/app/selection"); await explained(a, "/app/selection nominating");
  await a.goto("/app/selection");
  await confirmIn(a, "Start the vote now", "Start the vote");
  await b.goto("/app");
  await now(b, "Vote for the next book");
  await b.getByRole("link", { name: "Vote now" }).click();
  await rank(b, ["Kindred", "Solaris"]);
  await explained(b, "/app/selection voting");
  await rank(a, ["Kindred", "Solaris"]);
  await a.goto("/app");
  await now(a, "Everyone has voted");
  await a.getByRole("link", { name: "Go and count the votes" }).click();
  await confirmIn(a, "Count the votes now", "Close and count");
  await expect(a.getByRole("heading", { level: 1, name: "How we chose" })).toBeVisible();
  await explained(a, "/app/selection chosen");
  await a.goto("/app");
  await now(a, "Arrange a meeting");
  await b.goto("/app");
  await now(b, "Enjoy the book");
  await b.getByRole("link", { name: "Our book", exact: true }).first().click();
  await expect(b.getByRole("heading", { level: 1, name: "Kindred" })).toBeVisible();
  await a.goto("/app/meetings/new");
  await explained(a, "/app/meetings/new");
  await a.goto("/app/meetings/new");
  await a.getByLabel("Title").fill("Supper");
  await a.getByLabel("Date and start time").fill(`${new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)}T19:00`);
  await a.getByRole("button", { name: "Arrange the meeting" }).click();
  await a.waitForURL(/meetings\/[0-9a-f-]{36}$/);
  const meeting = new URL(a.url()).pathname;
  await b.goto("/app");
  await now(b, "Are you coming to the meeting?");
  await b.getByRole("link", { name: "Answer" }).click();
  await b.getByRole("button", { name: "Going", exact: true }).click();
  await expect(b.getByRole("button", { name: "Going (your answer)" })).toBeVisible();
  await b.goto("/app/current-book");
  await b.getByRole("radio", { name: "Finished" }).check();
  await b.getByRole("button", { name: "Update my progress" }).click();
  await expect(b.getByText("Saved.")).toBeVisible();
  await b.goto("/app");
  await now(b, "You have finished the book");
  await addToMyLibrary(a, "left hand", "The Left Hand of Darkness");
  const book = new URL(a.url()).pathname;
  for (const path of ["/app", "/app/current-book", meeting, `${meeting}/edit`, "/app/meetings", "/app/library", "/app/archive", "/app/members", "/app/my-library", "/app/recommendations", "/app/recommendations?view=made", "/app/notifications", "/app/calendar", "/app/meetings/find", "/app/settings", "/app/account", "/app/help", "/app/add-book", book]) {
    await a.goto(path);
    await explained(a, path);
  }
  await a.goto(meeting);
  await a.getByRole("button", { name: "Write up this meeting" }).click();
  await a.getByLabel("This meeting has taken place").check();
  await a.getByRole("button", { name: "Save the record" }).click();
  await expect(a.getByRole("dialog")).toHaveCount(0);
  await b.goto("/app");
  await now(b, "Say what you thought");
  await a.goto("/app/current-book");
  await confirmIn(a, "Finish this book", "Finish it");
  await a.waitForURL(/archive\/.+/);
  await explained(a, "archived book");
  await a.goto("/app");
  await now(a, "Choose your next book");
  expect(problems).toEqual([]);
});

test("buttons explain themselves on hover and focus, and help is on every page", async ({ browser }) => {
  const problems: string[] = [];
  const page = await person(browser, problems);
  await signUp(page, "Ida");
  await createClub(page, "Hints");
  await page.goto("/app/members");
  const tip = page.getByRole("tooltip");
  const button = page.getByRole("button", { name: "Invite someone" });
  await button.hover();
  await expect(tip).toHaveText("Make a link that lets one friend join this club.");
  await tip.hover(); // stays while the pointer is on it
  await page.waitForTimeout(300);
  await expect(tip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
  await page.mouse.move(5, 5);
  await page.getByRole("link", { name: "My books" }).first().focus();
  await page.keyboard.press("Tab");
  await expect(tip).toHaveText("Books members have suggested to each other, outside the vote.");
  // in a dialog too
  await button.click();
  await page.getByRole("button", { name: "Make an invitation link" }).hover();
  await expect(tip).toHaveText(/works for seven days/);
  await page.keyboard.press("Escape");
  // page help, and turning explanations off
  await page.getByRole("button", { name: "Help with this page" }).click();
  await expect(page.getByRole("dialog", { name: "Members" })).toContainText("Any member can invite a friend");
  await page.getByRole("checkbox", { name: /Explain buttons/ }).uncheck();
  await page.keyboard.press("Escape");
  await button.hover();
  await page.waitForTimeout(700);
  await expect(tip).toBeHidden();
  await page.getByRole("button", { name: "Help with this page" }).click();
  await page.getByRole("link", { name: "Read the full guide" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Help and guide" })).toBeVisible();
  expect(problems).toEqual([]);
});

test("on a phone, an action explains itself the first time it is tapped", async ({ browser }) => {
  const problems: string[] = [];
  const desk = await person(browser, problems);
  await signUp(desk, "Jo");
  await createClub(desk, "Touch");
  await desk.goto("/app/meetings/new");
  await desk.getByLabel("Title").fill("Picnic");
  await desk.getByLabel("Date and start time").fill(`${new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)}T12:00`);
  await desk.getByRole("button", { name: "Arrange the meeting" }).click();
  await desk.waitForURL(/meetings\/[0-9a-f-]{36}$/);
  const phone = await browser.newContext({ storageState: await desk.context().storageState(), hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
  const page = await phone.newPage();
  await page.goto(new URL(desk.url()).pathname);
  await page.getByRole("button", { name: "Maybe", exact: true }).tap();
  const ask = page.getByRole("alertdialog", { name: "What this does" });
  await expect(ask).toContainText("Tells the club you might come.");
  await ask.getByRole("button", { name: "Not now" }).tap();
  await expect(page.getByRole("button", { name: "Maybe (your answer)" })).toHaveCount(0);
  await page.getByRole("button", { name: "Maybe", exact: true }).tap();
  await ask.getByRole("button", { name: "Go ahead" }).tap();
  await expect(page.getByRole("button", { name: "Maybe (your answer)" })).toBeVisible();
  await page.getByRole("button", { name: "Going", exact: true }).tap();
  await ask.getByRole("button", { name: "Go ahead" }).tap();
  await expect(page.getByRole("button", { name: "Going (your answer)" })).toBeVisible();
  await page.getByRole("button", { name: "Maybe", exact: true }).tap(); // explained already: acts at once
  await expect(page.getByRole("button", { name: "Maybe (your answer)" })).toBeVisible();
  expect(problems).toEqual([]);
});

test("searching follows typing without wasting calls", async ({ browser }) => {
  const problems: string[] = [];
  const page = await person(browser, problems);
  await signUp(page, "Kit");
  const calls: { scope: string; q: string }[] = [];
  page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname === "/api/books/search") calls.push({ scope: u.searchParams.get("scope")!, q: u.searchParams.get("q")! }); });
  const full = () => calls.filter((c) => c.scope === "all").map((c) => c.q);
  await page.goto("/app/add-book");
  const box = page.getByLabel("Title, author or ISBN, in any language");
  await box.pressSequentially("left hand of darkness", { delay: 60 }); // no Enter, no button
  await expect(page.getByRole("button", { name: /The Left Hand of Darkness/ })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(full()).toEqual(["left hand of darkness"]); // 21 keystrokes, one catalogue search
  await box.fill("kindred");
  await expect(page.getByRole("button", { name: /Kindred/ })).toBeVisible();
  const before = calls.length;
  await box.fill("left hand of darkness"); // the stub is missing one provider, so this may be asked again...
  await expect(page.getByRole("button", { name: /The Left Hand of Darkness/ })).toBeVisible();
  expect(calls.length - before).toBeLessThanOrEqual(2);
  calls.length = 0;
  await box.fill("di"); // too short to ask the public catalogues
  await page.waitForTimeout(1200);
  expect(full()).toEqual([]);
  await box.fill("978044147"); // part of an ISBN
  await page.waitForTimeout(1200);
  expect(full()).toEqual([]);
  await box.fill("solaris");
  await box.press("Enter"); // asks at once, and only once
  await expect(page.getByRole("button", { name: /Solaris/ })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(full()).toEqual(["solaris"]);
  expect(problems).toEqual([]);
});

test("a quick catalogue is shown without waiting for a slow one", async ({ browser }) => {
  const problems: string[] = [];
  const page = await person(browser, problems);
  await signUp(page, "Tam");
  await page.goto("/app/add-book");
  const started = Date.now();
  await page.getByLabel("Title, author or ISBN, in any language").fill(`tortoise ${Date.now().toString(36)}`); // new each run: the server remembers answers for a day
  const hare = page.getByRole("button", { name: /The Hare Was Here/ });
  await expect(hare).toBeVisible({ timeout: 2000 });
  expect(Date.now() - started).toBeLessThan(2000);
  await expect(page.getByText("Still looking in Open Library…")).toBeVisible();
  await expect(page.getByRole("button", { name: /The Tortoise Arrives/ })).toBeVisible();
  await expect(page.getByText("Still looking in Open Library…")).toHaveCount(0);
  const order = (await page.locator("main ul button").allInnerTexts()).map((t) => t.split("\n").find((l) => /Hare|Tortoise/.test(l)));
  expect(order).toEqual(["The Hare Was Here", "The Tortoise Arrives"]); // nothing moved
  await hare.click();
  await expect(page.getByRole("heading", { level: 2, name: "The Hare Was Here" })).toBeVisible();
  expect(problems).toEqual([]);
});
