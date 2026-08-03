import { expect, test } from "@playwright/test";

test("keeps home and individual month background choices independent", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Choose background" }).click();
  await page.getByRole("button", { name: "Random background" }).click();

  await page.goto("/calendar/2026/07");
  await page.getByRole("button", { name: "Choose background" }).click();
  await expect(
    page.getByRole("button", {
      name: "Use exhibition white background",
    }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Random background" }).click();
  await page.goto("/calendar/2026/08");
  await page.getByRole("button", { name: "Choose background" }).click();
  await expect(
    page.getByRole("button", {
      name: "Use exhibition white background",
    }),
  ).toHaveAttribute("aria-pressed", "true");

  await page
    .getByRole("button", { name: "Close background picker" })
    .click();
  await page.goto("/calendar/2026/07");
  await page.getByRole("button", { name: "Choose background" }).click();
  await expect(
    page.getByRole("button", { name: "Random background" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page
    .getByRole("button", { name: "Close background picker" })
    .click();
  await page.getByRole("button", { name: "Bookshelf" }).click();
  await page.getByRole("button", { name: "Choose background" }).click();
  await expect(
    page.getByRole("button", { name: "Random background" }),
  ).toHaveAttribute("aria-pressed", "true");
});
