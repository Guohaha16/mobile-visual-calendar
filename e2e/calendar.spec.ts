import { expect, expectNoHorizontalOverflow, test } from "./fixtures";

test("renders a centered seven-column July calendar", async ({ page }) => {
  await page.goto("/calendar/2026/07");

  await expect(page.getByRole("button", { name: /^Open day 2026-07-/ })).toHaveCount(31);
  await expect(page.getByAltText("Calendar paper")).toBeVisible();
  await expect(page.getByTestId("calendar-book")).toBeVisible();

  const grid = page.getByTestId("calendar-grid");
  const geometry = await grid.locator("[data-calendar-cell]").evaluateAll((cells) => {
    const firstRow = cells.slice(0, 7).map((cell) => cell.getBoundingClientRect());
    return {
      centers: firstRow.map((rect) => rect.left + rect.width / 2),
      widths: firstRow.map((rect) => rect.width),
    };
  });
  expect(Math.max(...geometry.widths) - Math.min(...geometry.widths)).toBeLessThan(0.75);
  const gaps = geometry.centers.slice(1).map((center, index) => center - geometry.centers[index]!);
  expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.75);

  const paperBox = await page.getByRole("region", { name: "July 2026 paper calendar" }).boundingBox();
  expect(paperBox).not.toBeNull();
  expect(Math.abs((paperBox!.x + paperBox!.width / 2) - (await page.evaluate(() => innerWidth / 2)))).toBeLessThan(2);
  await expectNoHorizontalOverflow(page);
});
