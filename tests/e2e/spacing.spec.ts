import { expect, test, type Page } from "@playwright/test";
import { addToMyLibrary, confirmIn, createClub, invite, joinViaInvite, nominate, person, rank, signUp, startCycle } from "./helpers";

/** Measures the spacing system described in globals.css, on every page. */
async function measure(page: Page, name: string, phone = false) {
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  const m = await page.evaluate(() => {
    const main = document.querySelector("main")!;
    const seen = (e: Element) => e.getBoundingClientRect().height > 0 && !e.closest("dialog") && !(e.parentElement?.closest("details:not([open])"));
    const px = (e: Element, p: string) => parseFloat(getComputedStyle(e).getPropertyValue(p));
    const all = (s: string) => [...main.querySelectorAll(s)].filter(seen);
    const head = main.querySelector(".page-head")!;
    const box = (e: Element) => e.getBoundingClientRect();
    const isHero = Boolean(head?.querySelector("[role=img]"));
    return {
      heads: all(".page-head").length,
      kicker: head?.querySelector(".rubric")?.textContent ?? "",
      kickerTop: isHero ? null : Math.round(box(head.querySelector(".rubric")!).top + scrollY),
      title: px(main.querySelector("h1")!, "font-size"),
      afterHead: head?.nextElementSibling ? Math.round(box(head.nextElementSibling).top - box(head).bottom) : null,
      sectionGaps: all(".section").filter((s) => s.nextElementSibling && seen(s.nextElementSibling)).map((s) => Math.round(box(s.nextElementSibling!).top - box(s).bottom)),
      sectionHeads: all(".section-head").map((h) => `${px(h, "border-bottom-width")}/${px(h, "padding-bottom")}/${px(h.querySelector("h2")!, "font-size")}`),
      bodies: all(".section-body").map((b) => px(b, "padding-top")),
      rows: all(".row").filter((r) => r.previousElementSibling).map((r) => `${px(r, "padding-top")}/${px(r, "border-top-width")}`),
      small: all(".row-sm").filter((r) => r.previousElementSibling).map((r) => `${px(r, "padding-top")}/${px(r, "border-top-width")}`),
      firsts: all(".row, .row-sm").filter((r) => !r.previousElementSibling).map((r) => px(r, "padding-top")),
      side: all("aside").map((a) => Math.round(box(a).width)),
      sideGaps: all("aside.side > * + *").map((e) => `${px(e, "margin-top")}/${px(e, "padding-top")}`),
      wide: all("form").map((f) => Math.round(box(f).width)).filter((w) => w > 576),
      strayHeads: [...main.querySelectorAll("h2")].filter((h) => seen(h) && !h.closest(".section-head, aside, dialog, [aria-labelledby=now]") && !h.classList.contains("sr-only") && h.getAttribute("tabindex") !== "-1").map((h) => h.textContent),
      wrapped: all(".section-head").filter((h) => { const link = h.querySelector(":scope > div"); return link && box(link).top > box(h.children[0]!).bottom; }).length,
      doubled: [...main.querySelectorAll(".page-head:not(.plain)")].filter((h) => { const n = h.nextElementSibling; return n && px(n, "border-top-width") > 0; }).length,
    };
  });
  const only = (list: unknown[], want: unknown, what: string) => expect.soft([...new Set(list)].filter((v) => v !== want), `${name}: ${what}`).toEqual([]);
  expect.soft(m.heads, `${name}: one standard header`).toBe(1);
  expect.soft(m.kicker, `${name}: kicker`).not.toBe("");
  expect.soft(m.title, `${name}: title size`).toBe(phone ? 32 : 41.6);
  if (m.kickerTop !== null) expect.soft(m.kickerTop, `${name}: title starts at the same height`).toBe(phone ? KICKER.phone : KICKER.desk);
  if (m.afterHead !== null) expect.soft(m.afterHead, `${name}: header to content`).toBe(phone ? 32 : 40);
  only(m.sectionGaps, 48, "between sections");
  only(m.sectionHeads, "1/12/20", "section headings");
  only(m.bodies, 20, "rule to content");
  only(m.rows, "20/1", "rows");
  only(m.small, "16/1", "compact rows");
  only(m.firsts, 0, "first rows sit on the section's own spacing");
  if (!phone) only(m.side, 272, "side column width");
  only(m.sideGaps, "24/24", "side column blocks");
  expect.soft(m.wide, `${name}: forms no wider than 36rem`).toEqual([]);
  expect.soft(m.strayHeads, `${name}: headings outside the section pattern`).toEqual([]);
  expect.soft(m.wrapped, `${name}: heading links that wrapped away`).toBe(0);
  expect.soft(m.doubled, `${name}: two rules in a row`).toBe(0);
}
const KICKER = { desk: 0, phone: 0 };

test("spacing and sections are the same on every page", async ({ browser }) => {
  test.setTimeout(300_000);
  const problems: string[] = [];
  const [a, b] = [await person(browser, problems), await person(browser, problems)];
  await signUp(a, "Ada");
  await createClub(a, "The Thursday Readers");
  for (const [key, size] of [["desk", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    await a.setViewportSize(size);
    await a.goto("/app/members");
    await a.waitForLoadState("networkidle");
    KICKER[key] = await a.evaluate(() => Math.round(document.querySelector("main .page-head .rubric")!.getBoundingClientRect().top + scrollY));
  }
  const sweep = async (state: string, paths: string[]) => {
    for (const phone of [false, true]) {
      await a.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1280, height: 900 });
      for (const p of paths) { await a.goto(p); await measure(a, `${state} ${p}${phone ? " (phone)" : ""}`, phone); }
    }
    await a.setViewportSize({ width: 1280, height: 900 });
  };
  const lists = ["/app", "/app/selection", "/app/meetings", "/app/library", "/app/archive", "/app/members", "/app/my-library", "/app/recommendations", "/app/notifications", "/app/calendar", "/app/meetings/find", "/app/help", "/app/account", "/app/settings", "/app/add-book"];
  await sweep("empty", lists);
  await joinViaInvite(b, "Ben", await invite(a), "The Thursday Readers");
  await invite(a);
  await addToMyLibrary(a, "left hand", "The Left Hand of Darkness");
  const book = new URL(a.url()).pathname;
  await a.getByRole("button", { name: "Recommend to club" }).click();
  await a.getByRole("dialog").getByRole("button", { name: "Recommend", exact: true }).click();
  await expect(a.getByRole("dialog")).toHaveCount(0);
  await addToMyLibrary(a, "solaris", "Solaris");
  await startCycle(a);
  await nominate(a, "left hand", "The Left Hand of Darkness", "Because of the sledge journey.");
  await nominate(b, "kindred", "Kindred", "Essential.");
  await sweep("nominating", ["/app", "/app/selection"]);
  await a.goto("/app/selection");
  await confirmIn(a, "Start the vote now", "Start the vote");
  await rank(a, ["Kindred", "The Left Hand of Darkness"]);
  await sweep("voting", ["/app", "/app/selection"]);
  await a.goto("/app/selection");
  await confirmIn(a, "Count the votes now", "Close and count");
  await expect(a.getByRole("heading", { level: 1, name: "How we chose" })).toBeVisible();
  await a.goto("/app/meetings/new");
  await a.getByLabel("Title").fill("First supper");
  await a.getByLabel("Date and start time").fill(`${new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)}T19:00`);
  await a.getByRole("button", { name: "Arrange the meeting" }).click();
  await a.waitForURL(/meetings\/[0-9a-f-]{36}$/);
  const meeting = new URL(a.url()).pathname;
  await a.goto("/app/current-book");
  for (const [open, label] of [["Add a question", "Question"], ["Add a quotation", "Quotation"], ["Add a note", "Note"], ["Add a note", "Note"]] as const) {
    await a.getByRole("button", { name: open }).click();
    await a.getByRole("textbox", { name: label }).fill("Something worth keeping.");
    await a.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
    await expect(a.getByRole("dialog")).toHaveCount(0);
  }
  await sweep("reading", [...lists, "/app/current-book", book, meeting, `${meeting}/edit`, "/app/meetings/new", "/app/recommendations?view=made", "/app/add-book?to=club"]);
  await a.goto("/app/current-book");
  await confirmIn(a, "Finish this book", "Finish it");
  await a.waitForURL(/archive\/.+/);
  await sweep("finished", ["/app/archive", new URL(a.url()).pathname, "/app"]);
  expect(problems).toEqual([]);
});
