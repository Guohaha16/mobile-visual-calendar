import { expect, expectNoHorizontalOverflow, test } from "./fixtures";

test("shows all twelve months and opens a dragged-to month", async ({ page }) => {
  await page.goto("/");

  const months = page.getByRole("button", { name: /^Open .+ 2026$/ });
  await expect(months).toHaveCount(12);
  await expect(page.getByRole("button", { name: "Open July 2026" })).toBeVisible();

  const track = page.getByTestId("book-track");
  const target = page.getByTestId("shelf-drag-target");
  const before = await track.evaluate((element) =>
    getComputedStyle(element).transform,
  );
  const targetBox = await target.boundingBox();
  expect(targetBox).not.toBeNull();
  const dragY = targetBox!.y + targetBox!.height * 0.72;
  await page.mouse.move(targetBox!.x + targetBox!.width * 0.3, dragY);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + targetBox!.width * 0.78, dragY, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(() => track.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(before);

  await page.getByRole("button", { name: "Open July 2026" }).click();
  await expect(page).toHaveURL(/\/calendar\/2026\/07$/);
  await expectNoHorizontalOverflow(page);
});
