import { expect, test } from "@playwright/test";
import { addToMyLibrary, createClub, person, signUp } from "./helpers";

// A page opened before a deployment still holds the old action IDs, so the
// server does not recognise its first save. The page must recover by itself.
test("a save made just after a deployment is not lost", async ({ browser }) => {
  const problems: string[] = [];
  const page = await person(browser, problems);
  await signUp(page, "Ines");
  await createClub(page, "Updates club");
  await addToMyLibrary(page, "left hand", "The Left Hand of Darkness");

  let rejected = 0;
  await page.route("**/app/books/**", async (route) => {
    const r = route.request();
    if (r.method() === "POST" && r.headers()["next-action"] && rejected === 0) {
      rejected++;
      return route.fulfill({ status: 404, headers: { "x-nextjs-action-not-found": "1", "content-type": "text/plain" }, body: "Server action not found." });
    }
    return route.fallback();
  });

  await page.getByRole("radio", { name: "4" }).check();
  await page.getByLabel("My review").fill("Written just before an update.");
  const reloaded = page.waitForEvent("load");
  await page.getByRole("button", { name: "Save review" }).click();
  await reloaded;
  expect(rejected).toBe(1);

  await expect(page.getByText("Commonplace was updated while this page was open")).toBeVisible();
  await expect(page.getByLabel("My review")).toHaveValue("Written just before an update.");
  await expect(page.getByRole("radio", { name: "4" })).toBeChecked();
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(page.getByText("Review saved. Only you can see it.")).toBeVisible();
  await expect(page.getByText("Commonplace was updated while this page was open")).toHaveCount(0);

  // Only once: a second reload is not started for the same page straight away.
  await page.reload();
  await expect(page.getByLabel("My review")).toHaveValue("Written just before an update.");
  expect(problems.filter((p) => !/was not found on the server|action failed/.test(p))).toEqual([]);
});

test("a dropped connection is explained in the form", async ({ browser }) => {
  const problems: string[] = [];
  const page = await person(browser, problems);
  await signUp(page, "Jun");
  await createClub(page, "Offline club");
  await addToMyLibrary(page, "left hand", "The Left Hand of Darkness");
  await page.route("**/app/books/**", (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.fallback()));
  await page.getByLabel("My review").fill("Lost signal.");
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(page.getByText("Commonplace could not be reached. Check your connection and try again.")).toBeVisible();
  await expect(page.getByLabel("My review")).toHaveValue("Lost signal.");
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
  await page.unroute("**/app/books/**");
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(page.getByText("Review saved. Only you can see it.")).toBeVisible();
});
