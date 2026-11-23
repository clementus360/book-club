import { expect, test, type Page } from "@playwright/test";
import { confirmIn, findBook, invite, joinViaInvite, person, rank, signUp } from "./helpers";

/** Nothing on the page should speak of books in a club that is not about them. */
async function noBooks(page: Page, path: string) {
  await page.goto(path);
  const text = await page.locator("main").innerText();
  expect(text, path).not.toMatch(/\bbooks?\b|\breading\b/i);
}

async function createClubOf(page: Page, kind: string, name: string) {
  await page.goto("/onboarding");
  await page.getByRole("radio", { name: new RegExp(`^${kind}`) }).check();
  await page.getByLabel("Name of the club").fill(name);
  await page.getByRole("button", { name: "Create the club" }).click();
  await page.waitForURL((u) => u.pathname === "/app");
}

test("a film club speaks of films from start to finish", async ({ browser }) => {
  const problems: string[] = [];
  const fay = await person(browser, problems);
  const gus = await person(browser, problems);
  await signUp(fay, "Fay");
  await createClubOf(fay, "A film club", "Reel Friends");
  await expect(fay.getByRole("link", { name: "Our film" }).first()).toBeAttached();
  await expect(fay.getByRole("link", { name: "My films" }).first()).toBeAttached();
  await joinViaInvite(gus, "Gus", await invite(fay), "Reel Friends");

  await fay.goto("/app/selection");
  await fay.getByRole("button", { name: "Start choosing a film" }).click();
  await expect(fay.getByLabel("Days to watch")).toBeVisible();
  await fay.getByRole("button", { name: "Start", exact: true }).click();
  await expect(fay.getByRole("heading", { level: 1, name: "Nominate a film" })).toBeVisible();

  // Fay finds hers in TMDB; Gus enters his by hand.
  await fay.goto("/app/add-book?to=nominate");
  await expect(fay.getByLabel("Title, in any language")).toBeVisible();
  await findBook(fay, "stalker", /Stalker/);
  await fay.getByLabel("Why this film? (optional)").fill("The Zone.");
  await fay.getByRole("button", { name: "Nominate this film" }).click();
  await fay.waitForURL("**/app/selection");
  await gus.goto("/app/add-book?to=nominate");
  await gus.getByRole("button", { name: "Enter the film by hand" }).click();
  await gus.getByLabel("Title", { exact: true }).fill("Home Movie");
  await gus.getByLabel("Director or directors").fill("Gus");
  await gus.getByLabel("Runtime in minutes").fill("42");
  await gus.getByRole("button", { name: "Continue" }).click();
  await gus.getByRole("button", { name: "Nominate this film" }).click();
  await gus.waitForURL("**/app/selection");

  await fay.goto("/app/selection");
  await confirmIn(fay, "Start the vote now", "Start the vote");
  await expect(fay.getByText("Use the arrows to move the film you most want to watch to the top.")).toBeVisible();
  await rank(fay, ["Stalker", "Home Movie"]);
  await rank(gus, ["Stalker", "Home Movie"]);
  await confirmIn(fay, "Count the votes now", "Close and count");

  await fay.goto("/app/current-book");
  await expect(fay.locator("#main").getByText("Reel Friends is watching")).toBeVisible();
  await expect(fay.getByRole("radio", { name: "Watching" })).toBeVisible();
  await fay.getByRole("radio", { name: "Watching" }).check();
  await expect(fay.getByLabel(/Page/)).toHaveCount(0);
  await fay.getByLabel("Goal for the meeting (optional)").fill("Watch it twice");
  await fay.getByRole("button", { name: "Save goal" }).click();
  await expect(fay.getByText("By the meeting: Watch it twice")).toBeVisible();

  for (const path of ["/app", "/app/selection", "/app/current-book", "/app/library", "/app/my-library", "/app/meetings", "/app/help"]) await noBooks(fay, path);

  // The film's own page: its director and runtime, where to watch it, and the credit TMDB asks for.
  await fay.goto("/app/current-book");
  await fay.getByRole("link", { name: "Stalker", exact: true }).first().click();
  await expect(fay.getByRole("paragraph").filter({ hasText: "Andrei Tarkovsky" })).toBeVisible();
  await expect(fay.getByText("2 h 41 min")).toBeVisible();
  await expect(fay.locator("#get").getByRole("heading", { name: "Watch this film" })).toBeVisible();
  await expect(fay.locator("#get").getByRole("link", { name: /JustWatch/ })).toHaveAttribute("href", /justwatch\.com\/.+search\?q=Stalker/);
  await expect(fay.getByRole("link", { name: "The Movie Database (TMDB)" })).toHaveAttribute("href", "https://www.themoviedb.org/movie/1396");
  await expect(fay.getByText("This product uses the TMDB API but is not endorsed or certified by TMDB.")).toBeVisible();
  await expect(fay.locator("main")).not.toContainText(/\bbooks?\b/i);
  expect(problems).toEqual([]);
});

test("a game club warns when members have nothing to play a nomination on", async ({ browser }) => {
  const problems: string[] = [];
  const ivy = await person(browser, problems);
  const jo = await person(browser, problems);
  await signUp(ivy, "Ivy");
  await createClubOf(ivy, "A game club", "Save Points");
  await joinViaInvite(jo, "Jo", await invite(ivy), "Save Points");

  // Jo only has a Switch.
  await jo.goto("/app/account");
  await jo.getByText("What you play on").click();
  await jo.getByRole("checkbox", { name: "Nintendo Switch" }).check();
  await jo.getByRole("button", { name: "Save platforms" }).click();
  await expect(jo.getByText("Platforms saved.")).toBeVisible();

  await ivy.goto("/app/selection");
  await ivy.getByRole("button", { name: "Start choosing a game" }).click();
  await ivy.getByRole("button", { name: "Start", exact: true }).click();
  await ivy.goto("/app/add-book?to=nominate");
  await findBook(ivy, "outer", /Outer Wilds/);
  await ivy.getByRole("button", { name: "Nominate this game" }).click();
  await ivy.waitForURL("**/app/selection");
  await expect(ivy.getByText("1 member has nothing to play this on")).toBeVisible();

  await ivy.getByRole("link", { name: "Outer Wilds", exact: true }).click();
  await expect(ivy.getByText("PC, PlayStation")).toBeVisible();
  await expect(ivy.getByText("About 22 hours to finish")).toBeVisible();
  await expect(ivy.getByRole("paragraph").filter({ hasText: "Mobius Digital" })).toBeVisible();
  const stores = ivy.locator("#get").getByRole("link");
  await expect(stores.filter({ hasText: "Steam" })).toBeVisible();
  await expect(stores.filter({ hasText: "PlayStation Store" })).toBeVisible();
  await expect(stores.filter({ hasText: "Nintendo eShop" })).toHaveCount(0);
  for (const path of ["/app", "/app/selection", "/app/my-library"]) await noBooks(ivy, path);
  expect(problems).toEqual([]);
});

test("one private list holds books and anime, filtered by kind", async ({ browser }) => {
  const problems: string[] = [];
  const kit = await person(browser, problems);
  await signUp(kit, "Kit");
  await createClubOf(kit, "An anime club", "Sakuga");
  await kit.goto("/app/my-library");
  await expect(kit.getByRole("heading", { level: 1, name: "My anime" })).toBeVisible();
  await kit.getByRole("link", { name: "Add an anime" }).first().click();
  await findBook(kit, "mushi", /Mushi-Shi/);
  await kit.getByRole("radio", { name: "Watching now" }).check();
  await kit.getByRole("button", { name: "Add to my anime" }).click();
  await expect(kit.getByRole("heading", { level: 1, name: "Mushi-Shi" })).toBeVisible();
  await expect(kit.getByText("26 episodes")).toBeVisible();
  await expect(kit.locator("#get").getByRole("link", { name: /Crunchyroll/ })).toHaveAttribute("href", "https://www.crunchyroll.com/mushishi");

  // A book, kept in the same private list.
  await kit.goto("/app/add-book?kind=book");
  await findBook(kit, "kindred", /Kindred/);
  await kit.getByRole("button", { name: "Add to my books" }).click();
  await expect(kit.getByRole("heading", { level: 1, name: "Kindred" })).toBeVisible();

  await kit.goto("/app/my-library");
  await expect(kit.getByRole("link", { name: "Mushi-Shi", exact: true })).toBeVisible();
  await expect(kit.getByRole("link", { name: "Kindred", exact: true })).toHaveCount(0);
  await kit.getByRole("navigation", { name: "What kind" }).getByRole("link", { name: "Books" }).click();
  await expect(kit.getByRole("heading", { level: 1, name: "My books" })).toBeVisible();
  await expect(kit.getByRole("link", { name: "Kindred", exact: true })).toBeVisible();
  await expect(kit.getByRole("link", { name: "Mushi-Shi", exact: true })).toHaveCount(0);
  expect(problems).toEqual([]);
});
