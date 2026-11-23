import { expect, test, type APIRequestContext } from "@playwright/test";
import { createClub, invite, joinViaInvite, nominate, person, signUp, startCycle } from "./helpers";

const API = "http://127.0.0.1:54399";
type Sent = { to: string[]; from: string; subject: string; text: string; html: string; headers: Record<string, string>; auth: string };

/** What the database's clock does each minute: deadlines, then a nudge to the app. */
async function minutePasses(request: APIRequestContext) {
  await request.post(`${API}/emulator/tick`);
  const secret = await (await request.get(`${API}/emulator/email-secret`)).json();
  expect((await request.post("/api/email/send", { headers: { Authorization: `Bearer ${secret}` } })).status()).toBe(202);
}
const inbox = async (request: APIRequestContext, to: string) => (await (await request.get(`${API}/emulator/emails?to=${encodeURIComponent(to)}`)).json()) as Sent[];

test("members are emailed at milestones, and can stop it in one step", async ({ browser, request }) => {
  test.setTimeout(150_000);
  const problems: string[] = [];
  const [a, b] = [await person(browser, problems), await person(browser, problems)];
  await signUp(a, "Ada");
  await createClub(a, "Letters");
  const ben = await joinViaInvite(b, "Ben", await invite(a), "Letters");

  // Only the server may ask for email to be sent.
  expect((await request.post("/api/email/send", { headers: { Authorization: "Bearer nope" } })).status()).toBe(401);
  expect((await request.post("/api/email/send")).status()).toBe(401);

  await startCycle(a);
  await minutePasses(request);
  await expect.poll(async () => (await inbox(request, ben)).map((m) => m.subject)).toEqual(["Letters: Nominations are open"]);
  const [first] = await inbox(request, ben);
  expect(first!.from).toBe("Commonplace <club@mail.example.test>");
  expect(first!.auth).toBe("Bearer re_test");
  expect(first!.text).toMatch(/Nominations close \w+day \d+ \w+, \d\d:\d\d/);
  expect(first!.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

  // Sending again sends nothing new.
  await minutePasses(request);
  await nominate(a, "solaris", "Solaris");
  await nominate(b, "kindred", "Kindred");
  await a.goto("/app/selection");
  await a.getByRole("button", { name: "Start the vote now", exact: true }).click();
  await a.getByRole("dialog").getByRole("button", { name: "Start the vote", exact: true }).click();
  await expect(a.getByRole("heading", { level: 1, name: /vote/i })).toBeVisible();
  await minutePasses(request);
  await expect.poll(async () => (await inbox(request, ben)).map((m) => m.subject)).toEqual(["Letters: Nominations are open", "Letters: Voting is open"]);

  // The link in the email leads into the club, through sign-in if need be.
  const link = (await inbox(request, ben))[1]!.text.match(/Vote now: (\S+)/)![1]!;
  await b.goto(link);
  await expect(b).toHaveURL(/\/app\/selection/);

  // Unsubscribing asks first, so a mail scanner opening the link changes nothing.
  const stop = first!.text.match(/To stop these emails: (\S+)/)![1]!;
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(stop);
  await expect(visitor.getByRole("heading", { level: 1, name: "Stop emails from Commonplace?" })).toBeVisible();
  await visitor.goto(stop.replace(/s=[^&]+/, "s=forged"));
  await expect(visitor.getByRole("heading", { level: 1, name: "This link is not valid" })).toBeVisible();
  await visitor.goto(stop);
  await visitor.getByRole("button", { name: "Stop these emails" }).click();
  await expect(visitor.getByRole("heading", { level: 1, name: "Emails stopped" })).toBeVisible();

  // Nothing more for Ben; he sees it is off, and can turn it back on.
  await a.goto("/app/meetings/new");
  await a.getByLabel("Title").fill("Supper");
  await a.getByLabel("Date and start time").fill(`${new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)}T19:00`);
  await a.getByRole("button", { name: "Arrange the meeting" }).click();
  await a.waitForURL(/meetings\/[0-9a-f-]{36}$/);
  await minutePasses(request);
  await b.waitForTimeout(500);
  expect(await inbox(request, ben)).toHaveLength(2);
  await b.goto("/app/account");
  await b.getByText("Email", { exact: true }).click();
  const box = b.getByRole("checkbox", { name: /Email me at important moments/ });
  await expect(box).not.toBeChecked();
  await box.check();
  await b.getByRole("button", { name: "Save email settings" }).click();
  await expect(b.getByText("You will be emailed at important moments.")).toBeVisible();

  // A mail app's one-click unsubscribe works without a page.
  expect((await request.post(stop.replace("/email/stop?", "/email/stop/now?"), { form: { "List-Unsubscribe": "One-Click" } })).status()).toBe(200);
  await b.reload();
  await b.getByText("Email", { exact: true }).click();
  await expect(b.getByRole("checkbox", { name: /Email me at important moments/ })).not.toBeChecked();
  expect(problems).toEqual([]);
});
