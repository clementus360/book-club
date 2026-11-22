import { expect, test } from "@playwright/test";
import { createClub, invite, joinViaInvite, person, signUp } from "./helpers";

const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

test("the club finds a date, and the meeting goes into people's calendars", async ({ browser, request }) => {
  test.setTimeout(150_000);
  const problems: string[] = [];
  const [a, b] = [await person(browser, problems), await person(browser, problems)];
  await signUp(a, "Ada");
  await createClub(a, "Dates");
  await joinViaInvite(b, "Ben", await invite(a), "Dates");

  // Ada suggests times. What was typed survives a mistake.
  await a.goto("/app/meetings");
  await a.getByRole("link", { name: "Find a date" }).click();
  await a.getByLabel("Title").fill("Supper, again");
  await a.getByLabel("Time 1").fill(`${day(5)}T19:00`);
  await a.getByLabel("Time 2").fill(`${day(5)}T19:00`);
  await a.getByRole("button", { name: "Add another time" }).click();
  await expect(a.getByLabel("Time 4 (optional)")).toBeVisible();
  await a.getByRole("button", { name: "Ask everyone" }).click();
  await expect(a.getByText("Suggest between two and eight different times.")).toBeVisible();
  await expect(a.getByLabel("Time 1")).toHaveValue(`${day(5)}T19:00`);
  await a.getByLabel("Time 2").fill(`${day(6)}T18:30`);
  await a.getByLabel("Timezone").selectOption("Africa/Kigali");
  await a.getByLabel("Location (optional)").fill("12 Acacia Lane");
  await a.getByRole("button", { name: "Ask everyone" }).click();
  await a.waitForURL(/meetings\/find\/[0-9a-f-]{36}$/);
  const path = new URL(a.url()).pathname;
  await expect(a.getByText("Nobody has answered yet.")).toBeVisible();

  // Ben hears about it and answers; he cannot choose.
  await b.goto("/app/notifications");
  await b.getByRole("link", { name: /Ada asked when you can meet: Supper, again/ }).click();
  await expect(b.getByRole("heading", { level: 1, name: "Supper, again" })).toBeVisible();
  await expect(b.getByRole("button", { name: "Choose this time" })).toHaveCount(0);
  const rows = b.locator("form fieldset");
  await rows.nth(0).getByRole("radio", { name: "No" }).check();
  await rows.nth(1).getByRole("radio", { name: "Yes" }).check();
  await b.getByRole("button", { name: "Send my answers" }).click();
  await expect(b.getByText("Thank you.")).toBeVisible();
  await expect(rows.nth(0).getByRole("radio", { name: "No" })).toBeChecked();
  await expect(b.getByText("1 of 2 members")).toBeVisible();
  await expect(b.getByRole("listitem").filter({ hasText: "18:30" })).toContainText("Suits most");

  // One more time, then a choice.
  await a.reload();
  await a.getByRole("button", { name: "Suggest another time" }).click();
  await a.getByLabel("Date and start time").fill(`${day(8)}T12:00`);
  await a.getByRole("button", { name: "Add this time" }).click();
  await expect(a.locator("form fieldset")).toHaveCount(3);
  await b.goto("/app/meetings");
  await expect(b.getByText("Waiting for your answer")).toBeVisible();
  await b.goto(path);
  await rows.nth(2).getByRole("radio", { name: "If needed" }).check();
  await b.getByRole("button", { name: "Update my answers" }).click();
  await expect(b.getByText("Thank you.")).toBeVisible();
  await a.reload();
  await a.getByRole("listitem").filter({ hasText: "18:30" }).getByRole("button", { name: "Choose this time" }).click();
  await a.getByRole("button", { name: "Arrange it" }).click();
  await a.waitForURL(/meetings\/[0-9a-f-]{36}$/);
  const meeting = new URL(a.url()).pathname;
  await expect(a.getByText("18:30")).toBeVisible();
  await b.goto(path); // the old address leads to the meeting, with Ben's answer kept
  await b.waitForURL(`**${meeting}`);
  await expect(b.getByRole("button", { name: "Going (your answer)" })).toBeVisible();

  // One meeting: opens the calendar filled in, with nothing to download.
  await b.getByText("Add to calendar").click();
  const google = new URL((await b.getByRole("link", { name: "Google Calendar" }).getAttribute("href"))!);
  expect(google.searchParams.get("text")).toBe("Supper, again");
  expect(google.searchParams.get("dates")).toBe(`${day(6).replaceAll("-", "")}T163000Z/${day(6).replaceAll("-", "")}T183000Z`);
  expect(google.searchParams.get("location")).toBe("12 Acacia Lane");
  await expect(b.getByRole("link", { name: "Outlook.com" })).toHaveAttribute("href", /^https:\/\/outlook\.live\.com\//);
  await expect(b.locator("main a[download]")).toHaveCount(0);
  if (process.env.SHOT_DIR) await b.screenshot({ path: `${process.env.SHOT_DIR}/menu.png` });
  await b.getByRole("link", { name: /Apple and other calendars/ }).click();

  // All meetings: each calendar is sent the private link.
  await expect(b.getByRole("heading", { level: 1, name: "Your calendar" })).toBeVisible();
  if (process.env.SHOT_DIR) await b.screenshot({ path: `${process.env.SHOT_DIR}/calendar.png`, fullPage: true });
  const sent = async (app: string, headers = {}) => (await b.request.get(`/app/calendar/open?with=${app}`, { maxRedirects: 0, headers })).headers()["location"]!;
  expect(await sent("apple")).toMatch(/^webcal:\/\/localhost:\d+\/calendar\/[\w-]{43}\.ics$/);
  expect(await sent("google")).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?cid=webcal%3A/);
  expect(await sent("outlook")).toMatch(/^https:\/\/outlook\.live\.com\/calendar\/0\/addfromweb\?url=http/);
  expect(await sent("work")).toMatch(/^https:\/\/outlook\.office\.com\//);
  expect(await sent("evil")).toMatch(/\/app\/calendar$/);
  expect(await sent("google", { "sec-fetch-site": "cross-site" })).toMatch(/\/app\/calendar$/);
  await b.reload();
  await b.getByText("Another calendar app").click();
  await b.getByRole("button", { name: "Show my private link" }).click();
  const link = await b.getByLabel("Your private link").inputValue();
  expect(link).toBe((await sent("apple")).replace("webcal:", "http:"));

  // What a calendar app, signed in to nothing, is given.
  const feed = await request.get(link);
  expect(feed.headers()["content-type"]).toBe("text/calendar; charset=utf-8");
  const text = await feed.text();
  expect(text).toContain("SUMMARY:Supper\\, again");
  expect(text).toContain(`DTSTART:${day(6).replaceAll("-", "")}T163000Z`);
  expect(text).toContain("STATUS:CONFIRMED");
  await a.getByRole("button", { name: "Cancel meeting" }).click();
  await a.getByRole("button", { name: "Cancel the meeting" }).click();
  await expect(a.getByText("Cancelled", { exact: true })).toBeVisible();
  expect(await (await request.get(link)).text()).toContain("STATUS:CANCELLED");
  for (const bad of ["/calendar/x.ics", `/calendar/${"a".repeat(43)}.ics`, `/calendar/${"a".repeat(43)}`]) expect((await request.get(bad)).status()).toBe(404);

  // Turned off: the old link is dead, gone from the page, and a new one is different.
  await b.locator("summary").filter({ hasText: "Turn off the link" }).click();
  await b.getByRole("button", { name: "Turn off my calendar link" }).click();
  await b.getByRole("button", { name: "Turn it off" }).click();
  await expect(b.getByRole("dialog")).toHaveCount(0);
  await expect(b.getByLabel("Your private link")).toHaveCount(0);
  expect((await request.get(link)).status()).toBe(404);
  expect((await sent("apple")).replace("webcal:", "http:")).not.toBe(link);
  expect(problems).toEqual([]);
});

test("looking for a date can be stopped, and works on a phone", async ({ browser }) => {
  const problems: string[] = [];
  const a = await person(browser, problems);
  await a.setViewportSize({ width: 360, height: 740 });
  await signUp(a, "Ada");
  await createClub(a, "Small");
  await a.goto("/app/meetings/find");
  await a.getByLabel("Title").fill("Tea");
  await a.getByLabel("Time 1").fill(`${day(5)}T19:00`);
  await a.getByLabel("Time 2").fill(`${day(6)}T18:30`);
  await a.getByRole("button", { name: "Ask everyone" }).click();
  await a.waitForURL(/meetings\/find\/[0-9a-f-]{36}$/);
  expect(await a.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  if (process.env.SHOT_DIR) await a.screenshot({ path: `${process.env.SHOT_DIR}/find.png`, fullPage: true });
  await a.getByRole("button", { name: "Stop looking for a date" }).click();
  await a.getByRole("button", { name: "Stop", exact: true }).click();
  await a.waitForURL("**/app/meetings");
  await expect(a.getByText("Finding a date")).toHaveCount(0);
  expect(problems).toEqual([]);
});
