import { expect, test } from "@playwright/test";
import { addToMyLibrary, confirmIn, createClub, invite, joinViaInvite, nominate, person, rank, signUp, startCycle } from "./helpers";

const SHOTS = process.env.E2E_SHOTS;

test("three friends read a book together, start to finish", async ({ browser }) => {
  test.setTimeout(240_000);
  const problems: string[] = [];
  const [ada, ben, chi] = [await person(browser, problems), await person(browser, problems), await person(browser, problems)];
  const shot = async (page: typeof ada, name: string) => { if (SHOTS) { await page.waitForTimeout(600); await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); } };
  const CLUB = "The Thursday Readers";

  await test.step("1–3: homepage, account, club", async () => {
    await ada.goto("/");
    await expect(ada.getByRole("heading", { level: 1 })).toContainText("Good books.");
    await shot(ada, "01-home");
    await ada.getByRole("link", { name: "Start a book club" }).first().click();
    await ada.waitForURL("**/signup");
    await shot(ada, "02-signup");
    await signUp(ada, "Ada");
    await ada.waitForURL("**/onboarding");
    await shot(ada, "03-onboarding");
    await createClub(ada, CLUB);
    await shot(ada, "04-empty-club");
  });

  await test.step("4–5: invitations, single use, already a member", async () => {
    const [forBen, forChi] = [await invite(ada), await invite(ada)];
    await shot(ada, "05-members");
    await ben.goto(forBen);
    await expect(ben.getByText("An invitation from Ada")).toBeVisible();
    await shot(ben, "06-invite");
    await joinViaInvite(ben, "Ben", forBen, CLUB);
    await ben.goto(forChi);
    await expect(ben.getByRole("heading", { name: `You already belong to ${CLUB}` })).toBeVisible();
    await joinViaInvite(chi, "Chi", forChi, CLUB);
    await chi.goto(forBen);
    await expect(chi.getByRole("heading", { name: /already belong/ })).toBeVisible();
  });

  await test.step("6–7: personal libraries and private reviews", async () => {
    await addToMyLibrary(ada, "left hand", "The Left Hand of Darkness");
    await ada.getByRole("radio", { name: "5" }).check();
    await ada.getByLabel("My review").fill("My private thoughts about Gethen.");
    await ada.getByRole("button", { name: "Save review" }).click();
    await expect(ada.getByText("Review saved. Only you can see it.")).toBeVisible();
    await addToMyLibrary(ben, "kindred", "Kindred", "Want to read");
    await ben.goto("/app/my-library");
    await expect(ben.getByRole("link", { name: "Kindred", exact: true })).toBeVisible();
    await expect(ben.getByRole("link", { name: "The Left Hand of Darkness", exact: true })).toHaveCount(0);
  });

  await test.step("8–9: recommend, sharing nothing private", async () => {
    await ada.goto("/app/my-library");
    await ada.getByRole("link", { name: "The Left Hand of Darkness", exact: true }).click();
    await ada.getByRole("button", { name: "Recommend to club" }).click();
    await ada.getByLabel("Why they might enjoy it (optional)").fill("It will start an argument, in a good way.");
    await shot(ada, "07-recommend");
    await ada.getByRole("dialog").getByRole("button", { name: "Recommend", exact: true }).click();
    await expect(ada.getByRole("dialog")).toHaveCount(0);
    await ben.goto("/app/recommendations");
    await expect(ben.getByText("It will start an argument, in a good way.")).toBeVisible();
    await ben.getByRole("link", { name: "The Left Hand of Darkness", exact: true }).click();
    await expect(ben.getByText("Recommended by Ada")).toBeVisible();
    expect(await ben.content()).not.toContain("My private thoughts about Gethen");
    await shot(ben, "08-book-as-ben");
  });

  await test.step("10–11: nominations", async () => {
    await startCycle(ada);
    await expect(ada.getByText("No books have been nominated yet.")).toBeVisible(); // a recommendation is not a nomination
    await nominate(ada, "left hand", "The Left Hand of Darkness", "Because of the sledge journey.");
    await nominate(ben, "kindred", "Kindred");
    await nominate(chi, "nervous", "Nervous Conditions", "A book I have pressed on everyone I know.");
    await expect(ada.getByRole("link", { name: "Nominate a book" })).toHaveCount(0);
    await ben.goto("/app/selection");
    await expect(ben.getByRole("button", { name: "Start the vote now" })).toHaveCount(0); // not an administrator
    await shot(ben, "09-nominations");
  });

  await test.step("12–13: private ballots, correct result", async () => {
    await ada.goto("/app/selection");
    await confirmIn(ada, "Start the vote now", "Start the vote");
    await expect(ada.getByRole("heading", { level: 1, name: "Time to vote" })).toBeVisible();
    await rank(ada, ["The Left Hand of Darkness", "Nervous Conditions", "Kindred"]);
    await rank(ben, ["Kindred", "Nervous Conditions", "The Left Hand of Darkness"]);
    await rank(chi, ["Nervous Conditions", "The Left Hand of Darkness", "Kindred"]);
    await rank(ben, ["Nervous Conditions", "Kindred", "The Left Hand of Darkness"]); // changes their mind
    await shot(ben, "10-ballot");
    await ada.goto("/app/selection");
    await expect(ada.getByText("3 of 3 members have voted")).toBeVisible();
    await confirmIn(ada, "Count the votes now", "Close and count");
    await expect(ada.getByRole("heading", { level: 1, name: "How we chose" })).toBeVisible();
    // Nervous Conditions 2+3+3, Left Hand 3+1+2, Kindred 1+2+1
    await expect(ada.getByRole("row").filter({ hasText: "Nervous Conditions" })).toContainText("8 points");
    await expect(ada.getByRole("row").filter({ hasText: "The Left Hand of Darkness" })).toContainText("6 points");
    await expect(ada.getByRole("row").filter({ hasText: "Kindred" })).toContainText("4 points");
    await shot(ada, "11-results");
  });

  await test.step("14–15: reading and progress", async () => {
    await ben.goto("/app/current-book");
    await expect(ben.getByRole("heading", { level: 1, name: "Nervous Conditions" })).toBeVisible();
    await ben.getByRole("radio", { name: "Reading", exact: true }).check();
    await ben.getByLabel("Page (optional)").fill("74");
    await ben.getByRole("button", { name: "Update my progress" }).click();
    await expect(ben.getByText("Reading, page 74")).toBeVisible();
    await chi.goto("/app/current-book");
    await expect(chi.getByText("Reading, page 74")).toBeVisible();
    await chi.getByRole("radio", { name: "Finished" }).check();
    await chi.getByRole("button", { name: "Update my progress" }).click();
    await expect(chi.getByText("Saved.")).toBeVisible();
  });

  await test.step("16–17: a meeting and attendance", async () => {
    await ada.goto("/app/meetings/new");
    await ada.getByLabel("Title").fill("Round Ben’s kitchen table");
    const when = new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10);
    await ada.getByLabel("Date and start time").fill(`${when}T19:00`);
    await ada.getByLabel("Timezone").selectOption("Africa/Kigali");
    await ada.getByLabel("Location").fill("12 Acacia Lane");
    await ada.getByText("More details").click();
    await ada.getByLabel("Discussion leader").selectOption({ label: "Chi (has not led yet)" });
    await ada.getByLabel("Agenda (optional)").fill("The ending.\nWhether Nyasha is right.");
    await ada.getByRole("button", { name: "Arrange the meeting" }).click();
    await expect(ada.getByRole("heading", { level: 1, name: "Round Ben’s kitchen table" })).toBeVisible();
    await ben.goto("/app/notifications");
    await ben.getByRole("link", { name: /Ada arranged a meeting/ }).click();
    await expect(ben.getByText("12 Acacia Lane")).toBeVisible();
    await expect(ben.getByText("19:00")).toBeVisible();
    await ben.getByRole("button", { name: "Going", exact: true }).click();
    await expect(ben.getByRole("button", { name: "Going (your answer)" })).toBeVisible();
    await ada.reload();
    await ada.getByRole("button", { name: "Maybe", exact: true }).click();
    await expect(ada.getByRole("button", { name: "Maybe (your answer)" })).toBeVisible();
    await shot(ben, "12-meeting");
  });

  await test.step("18: questions, quotations, notes, outcomes and a club review", async () => {
    await chi.goto("/app/current-book");
    await chi.getByRole("button", { name: "Add a question" }).click();
    await chi.getByRole("textbox", { name: "Question" }).fill("What does education cost Tambu?");
    await chi.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
    await expect(chi.getByText("What does education cost Tambu?")).toBeVisible();
    await chi.getByRole("button", { name: "Add a quotation" }).click();
    await chi.getByRole("textbox", { name: "Quotation" }).fill("A passage we argued over.");
    await chi.getByLabel("Where it is from (optional)").fill("chapter 4");
    await chi.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
    await expect(chi.getByText("chapter 4. Noted by Chi")).toBeVisible();
    await ben.goto("/app/current-book");
    await ben.getByRole("button", { name: "Add a note" }).click();
    await ben.getByRole("textbox", { name: "Note" }).fill("The first line is extraordinary.");
    await ben.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
    await expect(ben.getByText("The first line is extraordinary.")).toBeVisible();
    await chi.goto("/app/meetings"); // Chi is the discussion leader
    await chi.getByRole("link", { name: "Round Ben’s kitchen table" }).click();
    await chi.getByRole("button", { name: "Write up this meeting" }).click();
    await chi.getByLabel("What was said and decided").fill("We agreed to disagree about the ending.");
    await chi.getByLabel("This meeting has taken place").check();
    await chi.getByRole("button", { name: "Save the record" }).click();
    await expect(chi.getByRole("dialog")).toHaveCount(0);
    await expect(chi.getByText("We agreed to disagree about the ending.")).toBeVisible();
    await ada.goto("/app/current-book");
    await ada.getByRole("button", { name: "Write a club review" }).click();
    await ada.getByRole("textbox", { name: "Review" }).fill("Our best choice yet.");
    await ada.getByRole("button", { name: "Save review" }).click();
    await expect(ada.getByRole("dialog")).toHaveCount(0);
    await expect(ada.getByText("Our best choice yet.")).toBeVisible();
    await shot(ada, "13-current-book");
    await ada.goto("/app");
    await shot(ada, "14-overview");
  });

  await test.step("19–20: completion and the archive", async () => {
    await ada.goto("/app/current-book");
    await confirmIn(ada, "Finish this book", "Finish it");
    await ada.waitForURL(/\/app\/archive\/.+/);
    await ben.goto("/app/archive");
    await ben.getByRole("link", { name: "Nervous Conditions", exact: true }).click();
    await expect(ben.getByText("3 of 3 members voted.")).toBeVisible();
    for (const t of ["What does education cost Tambu?", "A passage we argued over.", "The first line is extraordinary.", "Our best choice yet.", "Round Ben’s kitchen table", "Chosen by a club vote"]) {
      await expect(ben.getByText(t).first()).toBeVisible();
    }
    await shot(ben, "15-archive");
    await startCycle(ada); // a new cycle does not disturb it
    await ben.goto("/app/archive");
    await expect(ben.getByRole("link", { name: "Nervous Conditions", exact: true })).toBeVisible();
    await ben.goto("/app/library");
    await expect(ben.getByRole("link", { name: /Read by the club/ })).toBeVisible();
    await shot(ben, "16-library");
  });

  await test.step("21: personal libraries stand alone, across clubs", async () => {
    await createClub(ada, "Second Club");
    await ada.goto("/app/recommendations");
    await ada.getByRole("link", { name: "Made by you" }).click();
    await expect(ada.getByText(`To ${CLUB}`)).toBeVisible();
    await ada.goto("/app/library");
    await expect(ada.getByText("No books here yet")).toBeVisible();
    await ada.goto("/app/my-library");
    await expect(ada.getByRole("link", { name: "The Left Hand of Darkness", exact: true })).toBeVisible();
    await shot(ada, "17-my-library");
    await ada.locator("summary").filter({ hasText: "Club menu" }).first().click();
    await ada.getByRole("button", { name: CLUB }).first().click();
    await expect(ada.getByRole("heading", { level: 1, name: CLUB })).toBeVisible();
    await ben.goto("/app/members");
    await confirmIn(ben, "Leave club", "Leave the club");
    await ben.goto("/app/my-library");
    await expect(ben.getByRole("link", { name: "Kindred", exact: true })).toBeVisible();
  });

  expect(problems).toEqual([]);
});
