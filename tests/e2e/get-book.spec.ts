import { expect, test } from "@playwright/test";
import { addToMyLibrary, createClub, person, signUp } from "./helpers";

test("a book page says where to read, borrow or buy it", async ({ browser }) => {
  const problems: string[] = [];
  const page = await person(browser, problems);
  await signUp(page, "Kofi");
  await createClub(page, "Copies club");
  await addToMyLibrary(page, "left hand", "The Left Hand of Darkness");
  const get = page.locator("#get");
  await expect(get.getByRole("heading", { name: "Get this book" })).toBeVisible();
  const borrow = get.getByRole("link", { name: /Borrow the e-book/ });
  await expect(borrow).toHaveAttribute("href", "https://openlibrary.org/books/OL5M");
  await expect(borrow).toHaveAttribute("target", "_blank");
  await expect(get.getByText("Open Library, free account needed")).toBeVisible();
  await expect(get.getByRole("link", { name: /Find it in a library/ })).toHaveAttribute("href", /search\.worldcat\.org/);
  await expect(get.getByRole("link", { name: /Amazon/ })).toBeVisible();
  await expect(get.getByRole("link", { name: /AbeBooks/ })).toBeVisible();
  await expect(get.getByRole("link", { name: /Read it free/ })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await get.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/get-this-book.png", fullPage: true });

  await addToMyLibrary(page, "kindred", "Kindred");
  await expect(page.locator("#get").getByRole("link", { name: /Read it free/ })).toHaveAttribute("href", "https://openlibrary.org/works/OL2W");
  expect(problems).toEqual([]);
});
