import { expect, test } from "@playwright/test";
import { addToMyLibrary, confirmIn, createClub, email, findBook, invite, joinViaInvite, nominate, PASSWORD, person, rank, signUp, startCycle } from "./helpers";

test("signed-out visitors are sent to sign in, and back again", async ({ page }) => {
  await page.goto("/app/meetings");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fmeetings/);
  const address = await signUp(page, "Dee");
  await page.goto("/app/my-library");
  await page.locator("summary").filter({ hasText: "Your menu: Dee" }).last().click();
  await page.locator("details[open]").getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/");
  await page.goto("/login?next=https://evil.test");
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password").fill("wrong password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email and password do not match an account.")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(address); // what was typed is kept
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/localhost:\d+\/(app|onboarding)/);
});

test("a password can be reset by email", async ({ page, request }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "needs the emulator's outbox");
  const address = email("eve");
  await signUp(page, "Eve", "/signup", address);
  await page.context().clearCookies();
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(address);
  await page.getByRole("button", { name: "Send the link" }).click();
  await expect(page.getByText("a reset link is on its way")).toBeVisible();
  const [mail] = await (await request.get(`http://127.0.0.1:54399/emulator/mail?to=${address}`)).json();
  await page.goto(mail.link);
  await page.waitForURL("**/reset-password");
  await page.getByLabel("New password", { exact: true }).fill("another long password");
  await page.getByLabel("New password, again").fill("another long password");
  await page.getByRole("button", { name: "Save password" }).click();
  await page.waitForURL(/\/(app|onboarding)/);
  await page.context().clearCookies();
  await page.goto(mail.link); // one use only
  await expect(page.getByText("That link has expired or has already been used.")).toBeVisible();
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password").fill("another long password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(app|onboarding)/);
});

test("invitations: revoked, used, and not real", async ({ browser }) => {
  const problems: string[] = [];
  const [a, b] = [await person(browser, problems), await person(browser, problems)];
  await signUp(a, "Ada");
  await createClub(a, "Invites");
  const revoked = await invite(a);
  await a.reload();
  await a.getByRole("button", { name: "Revoke" }).click();
  await expect(a.getByText("There are no pending invitations.")).toBeVisible();
  await b.goto(revoked);
  await expect(b.getByRole("heading", { name: "This invitation was withdrawn" })).toBeVisible();
  await b.goto(`/invite/${"0".repeat(64)}`);
  await expect(b.getByRole("heading", { name: "This link is not valid" })).toBeVisible();
  const good = await invite(a);
  await joinViaInvite(b, "Ben", good, "Invites");
  const c = await person(browser, problems);
  await c.goto(good);
  await expect(c.getByRole("heading", { name: "This invitation has been used" })).toBeVisible();
  // last-admin protection, then removal ends access at once
  await a.goto("/app/members");
  await expect(a.getByText("Sole administrator")).toBeVisible();
  await confirmIn(a, "Remove", "Remove from the club");
  await expect(a.getByRole("heading", { name: "1 member" })).toBeVisible();
  await b.goto("/app");
  await b.waitForURL("**/onboarding");
  expect(problems).toEqual([]);
});

test("books: outage, manual entry, volumes and duplicates", async ({ browser }) => {
  const problems: string[] = [];
  const page = await person(browser, problems);
  await signUp(page, "Fay");
  await page.goto("/app/add-book");
  await page.getByLabel("Title, author or ISBN, in any language").fill("outage");
  await expect(page.getByText("Open Library and Google Books could not be reached")).toBeVisible();
  await page.getByRole("button", { name: "Enter the book by hand" }).click();
  await page.getByLabel("Title", { exact: true }).fill("海街diary");
  await page.getByLabel("Author or authors").fill("吉田秋生");
  await page.getByLabel("Format").selectOption({ label: "Manga" });
  await page.getByLabel("Series").fill("海街diary");
  await page.getByLabel("Volume").fill("1");
  await page.getByLabel("Language").fill("ja");
  await page.getByText("More details").click();
  await page.getByLabel("ISBN").fill("9780441478126");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That ISBN does not check out.")).toBeVisible();
  await page.getByLabel("ISBN").fill("");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Add to my books" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "海街diary" })).toBeVisible();
  // the next volume is a different book
  await page.getByRole("link", { name: "Add another volume" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("海街diary");
  await page.getByLabel("Volume").fill("2");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Add to my books" }).click();
  await expect(page.getByText("Volume 2")).toBeVisible();
  // the same volume again is offered, not duplicated
  await page.getByRole("link", { name: "Add another volume" }).click();
  await page.getByLabel("Volume").fill("2");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Is it one of these?" })).toBeVisible();
  await page.getByRole("button", { name: /海街diary/ }).click();
  await page.getByRole("button", { name: "Add to my books" }).click();
  await expect(page.getByText("This book is already in your library.")).toBeVisible();
  // provider volumes stay apart too
  await addToMyLibrary(page, "monster", "Monster, Vol. 1");
  await addToMyLibrary(page, "monster", "Monster, Vol. 2");
  await page.goto("/app/my-library");
  await expect(page.locator("main article")).toHaveCount(4);
  await page.getByLabel("Search my books").fill("吉田");
  await expect(page.locator("main article")).toHaveCount(2);
  // editing and removing
  await page.getByRole("link", { name: "海街diary" }).first().click();
  await page.getByRole("button", { name: "Edit book details" }).click();
  await page.getByRole("dialog").getByLabel("Title", { exact: true }).fill("Umimachi Diary");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Umimachi Diary" })).toBeVisible();
  await confirmIn(page, "Remove from my books", "Remove it");
  await page.waitForURL("**/app/my-library");
  await expect(page.locator("main article")).toHaveCount(3);
  expect(problems).toEqual([]);
});

test("recommendations: snapshots, editing, withdrawing, one club only", async ({ browser }) => {
  const problems: string[] = [];
  const [a, b] = [await person(browser, problems), await person(browser, problems)];
  await signUp(a, "Ada");
  await createClub(a, "Alpha");
  await createClub(a, "Beta");
  await joinViaInvite(b, "Ben", await invite(a), "Beta"); // Beta is selected
  await addToMyLibrary(a, "solaris", "Solaris");
  await a.getByRole("radio", { name: "4" }).check();
  await a.getByLabel("My review").fill("First thoughts.");
  await a.getByRole("button", { name: "Save review" }).click();
  await expect(a.getByText("Review saved.")).toBeVisible();
  await a.getByRole("button", { name: "Recommend to club" }).click();
  const dialog = a.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Beta" }).check();
  await dialog.getByRole("checkbox", { name: /Share my rating/ }).check();
  await dialog.getByRole("checkbox", { name: /Share my review/ }).check();
  await expect(dialog.getByLabel("What the club will read")).toHaveValue("First thoughts.");
  await dialog.getByRole("button", { name: "Recommend", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await a.getByRole("textbox", { name: "My review" }).fill("Second, harsher thoughts.");
  await a.getByRole("button", { name: "Save review" }).click();
  await expect(a.getByText("Review saved.")).toBeVisible();
  await b.goto("/app/recommendations");
  await expect(b.getByText("First thoughts.")).toBeVisible();
  await expect(b.getByRole("img", { name: "4 out of 5" })).toBeVisible();
  expect(await b.content()).not.toContain("harsher");
  await a.goto("/app/recommendations?view=made");
  await expect(a.getByText("To Beta")).toBeVisible();
  await a.getByRole("button", { name: "Edit" }).click();
  await dialog.getByRole("radio", { name: "Stop sharing a rating" }).check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await b.reload();
  await expect(b.getByRole("img", { name: "4 out of 5" })).toHaveCount(0);
  await a.getByRole("button", { name: "Withdraw" }).click();
  await expect(a.getByText("You have not recommended anything yet")).toBeVisible();
  await b.reload();
  await expect(b.getByText("No recommendations yet")).toBeVisible();
  expect(problems).toEqual([]);
});

test("a tie goes to a runoff, then to a recorded decision", async ({ browser }) => {
  const problems: string[] = [];
  const [a, b] = [await person(browser, problems), await person(browser, problems)];
  await signUp(a, "Ada");
  await createClub(a, "Tied");
  await joinViaInvite(b, "Ben", await invite(a), "Tied");
  await startCycle(a);
  await nominate(a, "solaris", "Solaris");
  await b.goto("/app/add-book?to=nominate");
  await findBook(b, "solaris", /Solaris/);
  await b.getByRole("button", { name: "Nominate this book" }).click();
  await expect(b.getByText("Someone has already nominated that book. Try another.")).toBeVisible();
  await nominate(b, "kindred", "Kindred");
  await b.getByRole("button", { name: "Withdraw" }).click();
  await expect(b.getByRole("link", { name: "Nominate a book" })).toBeVisible();
  await nominate(b, "kindred", "Kindred");
  await a.goto("/app/selection");
  await confirmIn(a, "Start the vote now", "Start the vote");
  for (let round = 0; round < 2; round++) {
    await rank(a, ["Solaris", "Kindred"]);
    await rank(b, ["Kindred", "Solaris"]);
    // a ballot being edited when voting closes is turned away, with an explanation
    if (round === 0) await b.goto("/app/selection");
    await a.reload();
    await confirmIn(a, "Count the votes now", "Close and count");
    if (round === 0) {
      await expect(a.getByRole("heading", { level: 1, name: "A tie-break vote" })).toBeVisible();
      await expect(a.getByText("The top books were tied.")).toBeVisible();
    }
  }
  await expect(a.getByRole("heading", { name: "It is still a tie" })).toBeVisible();
  await b.getByRole("button", { name: "Update my vote" }).click();
  await expect(b.getByRole("heading", { level: 1, name: "A decision is needed" })).toBeVisible();
  await expect(b.getByRole("button", { name: "Record the decision" })).toHaveCount(0);
  await a.getByRole("button", { name: "Record the decision" }).click();
  await a.getByRole("radio", { name: "Kindred" }).check();
  await a.getByLabel("How it was decided").fill("We drew a title from a hat.");
  await a.getByRole("dialog").getByRole("button", { name: "Choose this book" }).click();
  await b.goto("/app/selection");
  await expect(b.getByText("We drew a title from a hat.")).toBeVisible();
  await b.goto("/app/current-book");
  await expect(b.getByRole("heading", { level: 1, name: "Kindred" })).toBeVisible();
  expect(problems).toEqual([]);
});

test("another club's pages cannot be reached by changing the address", async ({ browser }) => {
  const problems: string[] = [];
  const [a, outsider] = [await person(browser, problems), await person(browser, problems)];
  await signUp(a, "Ada");
  await createClub(a, "Private");
  await a.goto("/app/meetings/new");
  await a.getByLabel("Title").fill("Secret supper");
  await a.getByLabel("Date and start time").fill(`${new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)}T19:00`);
  await a.getByRole("button", { name: "Arrange the meeting" }).click();
  await a.waitForURL(/meetings\/[0-9a-f-]{36}$/);
  const path = new URL(a.url()).pathname;
  await signUp(outsider, "Oz");
  await createClub(outsider, "Elsewhere");
  await outsider.goto(path);
  await expect(outsider.getByText("This is not here")).toBeVisible();
  expect(await outsider.content()).not.toContain("Secret supper");
  // cancelling and restoring
  await a.reload();
  await confirmIn(a, "Cancel meeting", "Cancel the meeting");
  await expect(a.getByText("Cancelled")).toBeVisible();
  await expect(a.getByRole("heading", { name: "Are you coming?" })).toHaveCount(0);
  await a.getByRole("button", { name: "Restore meeting" }).click();
  await expect(a.getByRole("heading", { name: "Are you coming?" })).toBeVisible();
  // a link into another of one's own clubs switches to it
  await createClub(a, "Second");
  await a.goto(path);
  await expect(a.getByRole("heading", { level: 1, name: "Secret supper" })).toBeVisible();
  await expect(a.locator("summary").filter({ hasText: "Club menu" }).first()).toContainText("Private");
  // one-time search endpoint refuses strangers
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get("/api/books/search?q=dune")).status()).toBe(401);
  expect(problems).toEqual([]);
});

test("settings: profile, club, password, closing a club", async ({ browser }) => {
  const problems: string[] = [];
  const page = await person(browser, problems);
  await signUp(page, "Gil");
  await createClub(page, "Short Lived");
  // Your account is under your name, opens over the page, and moves nothing.
  await page.goto("/app");
  const mine = page.locator("details").filter({ hasText: "Your menu: Gil" }).last();
  const layout = () => page.evaluate(() => ({ doc: document.documentElement.scrollHeight, side: [...document.querySelectorAll("div")].filter((d) => d.scrollHeight > d.clientHeight + 1 && getComputedStyle(d).overflowY === "auto").length, nav: document.querySelector("nav[aria-label=Club]")!.getBoundingClientRect().top }));
  await page.setViewportSize({ width: 1280, height: 620 });
  const before = await layout();
  await mine.locator("summary").click();
  await expect(mine.getByRole("button", { name: "Sign out" })).toBeInViewport({ ratio: 1 });
  await expect(mine.getByRole("link", { name: "Club settings" })).toHaveCount(0);
  expect(await layout()).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(mine.getByRole("link", { name: "Your account" })).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 900 });
  await mine.locator("summary").click();
  await mine.getByRole("link", { name: "Your account" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  await expect(mine.getByRole("link", { name: "Your account" })).toBeHidden(); // closes itself
  await expect(page.getByLabel("Display name")).toBeHidden();
  await page.getByText("Name and picture").click();
  await page.getByLabel("Display name").fill("Gilberto");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gilberto" })).toBeVisible();
  await page.getByText("Choose one, or change it.").click();
  await page.getByLabel("New password", { exact: true }).fill("yet another password");
  await page.getByLabel("New password, again").fill("not the same thing");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Those passwords do not match.")).toBeVisible();
  // Club settings are under the club's name.
  await page.locator("summary").filter({ hasText: "Club menu" }).first().click();
  await page.getByRole("link", { name: "Club settings" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Club settings" })).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
  await page.getByText("Name and description").click();
  await page.getByLabel("Club name").fill("Short Story Club");
  await page.getByRole("button", { name: "Save club settings" }).first().click();
  await expect(page.getByText("Club settings saved.").first()).toBeVisible();
  await page.getByText("How long each step lasts").click();
  await page.getByLabel("Reading", { exact: true }).fill("21");
  await page.getByRole("button", { name: "Save club settings" }).last().click();
  await expect(page.getByText("Club settings saved.").last()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Reading", { exact: true })).toHaveValue("21");
  await expect(page.getByLabel("Club name")).toHaveValue("Short Story Club"); // neither form undoes the other
  await page.getByText("Close this club").click();
  await page.getByRole("button", { name: "Close the club", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Short Story Club");
  await page.getByRole("dialog").getByRole("button", { name: "Close the club for good" }).click();
  await page.waitForURL("**/onboarding");
  expect(problems).toEqual([]);
});

test("a session whose account has been deleted ends cleanly", async ({ page }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "needs the test database");
  const address = await signUp(page, "Hal");
  await page.request.post(`http://127.0.0.1:54399/emulator/delete?email=${address}`);
  await page.goto("/app/my-library");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("leaving a club does not break the page of recommendations made there", async ({ browser }) => {
  const problems: string[] = [];
  const [a, b] = [await person(browser, problems), await person(browser, problems)];
  await signUp(a, "Ada");
  await createClub(a, "Leaving");
  await joinViaInvite(b, "Ben", await invite(a), "Leaving");
  await a.goto("/app/add-book?to=club");
  await a.getByRole("button", { name: "Enter the book by hand" }).click();
  await a.getByLabel("Title", { exact: true }).fill("Family Letters");
  await a.getByRole("button", { name: "Continue" }).click();
  await a.getByRole("button", { name: "Add to the club shelf" }).click();
  await a.waitForURL("**/app/library");
  await b.goto("/app/library");
  await b.getByRole("link", { name: "Family Letters" }).click();
  await b.getByRole("button", { name: "Add to my books" }).click();
  await b.getByRole("button", { name: "Recommend to club" }).click();
  await b.getByRole("dialog").getByRole("button", { name: "Recommend", exact: true }).click();
  await expect(b.getByRole("dialog")).toHaveCount(0);
  await confirmIn(b, "Remove from my books", "Remove it");
  await b.waitForURL("**/app/my-library");
  await b.goto("/app/members");
  await confirmIn(b, "Leave club", "Leave the club");
  await b.waitForURL("**/onboarding");
  await b.goto("/app/recommendations?view=made");
  await expect(b.getByRole("heading", { level: 1, name: "Recommendations" })).toBeVisible();
  expect(problems).toEqual([]);
});

test("signing in with Google keeps an invitation, and survives a change of mind", async ({ browser }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "needs the emulator's stand-in for Google");
  const problems: string[] = [];
  const [a, g] = [await person(browser, problems), await person(browser, problems)];
  const google = (data: object) => g.request.post("http://127.0.0.1:54399/emulator/google", { data });
  await signUp(a, "Ada");
  await createClub(a, "By Google");
  const link = await invite(a);
  await g.goto(link);
  await g.getByRole("link", { name: "Create an account to join" }).click();
  await google({ cancel: true });
  await g.getByRole("link", { name: "Continue with Google" }).click();
  await expect(g.getByText("Signing in with Google did not finish.")).toBeVisible();
  await google({ email: email("grace"), name: "Grace Hopper" });
  await g.goto(link);
  await g.getByRole("link", { name: "Create an account to join" }).click();
  await g.getByRole("link", { name: "Continue with Google" }).click();
  await g.getByRole("button", { name: "Join the club" }).click();
  await g.waitForURL((u) => u.pathname === "/app");
  await a.goto("/app/members");
  await expect(a.getByText("Grace Hopper").first()).toBeVisible();
  // an outside address can never be the destination
  await g.context().clearCookies();
  await g.goto("/auth/google?next=https://evil.test");
  await expect(g).toHaveURL(/localhost:\d+\/app/);
  expect(problems).toEqual([]);
});
