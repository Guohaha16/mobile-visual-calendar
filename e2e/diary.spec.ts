import {
  ONE_PIXEL_PNG,
  ensureServiceWorkerControl,
  expect,
  expectNoHorizontalOverflow,
  test,
} from "./fixtures";

const LONG_TEXT =
  "This is a longer diary record that uses the full conversation width. ".repeat(8);

test("opens from both triggers and switches the bound date", async ({ page }) => {
  await page.goto("/calendar/2026/07");

  await page.getByRole("button", { name: "Open day 2026-07-18" }).click();
  await expect(page.getByRole("dialog", { name: "Diary for 2026-07-18" })).toBeVisible();
  await page.getByLabel("Diary date").fill("2026-07-19");
  await expect(page.getByRole("dialog", { name: "Diary for 2026-07-19" })).toBeVisible();
  await page.getByRole("button", { name: "Close diary" }).click();

  await page.getByRole("button", { name: "Add diary entry" }).click();
  await expect(page.getByRole("dialog", { name: /Diary for 2026-08-/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("keeps image-first records through offline reload and deletes immediately", async ({
  context,
  page,
}) => {
  await page.goto("/calendar/2026/07");
  await ensureServiceWorkerControl(page);
  await page.getByRole("button", { name: "Open day 2026-07-29" }).click();

  const imageInput = page.getByLabel("Add diary images");
  await imageInput.setInputFiles([
    { buffer: ONE_PIXEL_PNG, mimeType: "image/png", name: "first.png" },
    { buffer: ONE_PIXEL_PNG, mimeType: "image/png", name: "second.png" },
  ]);
  await page.getByLabel("Diary text").evaluate((element, png) => {
    const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
  }, ONE_PIXEL_PNG.toString("base64"));
  await expect(page.getByLabel("Selected diary images").getByRole("img")).toHaveCount(3);
  await page.getByLabel("Diary text").fill(LONG_TEXT);

  await context.setOffline(true);
  await page.getByRole("button", { name: "Send diary entry" }).click();
  await expect(page.getByText(LONG_TEXT)).toBeVisible();
  await expect(page.getByText("Waiting to sync")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("main", { name: "Visual diary" })).toBeVisible();
  await page.getByRole("button", { name: "Open day 2026-07-29" }).click();
  await expect(page.getByText(LONG_TEXT)).toBeVisible();
  await expect(page.getByRole("feed", { name: "Diary history" }).getByRole("img")).toHaveCount(3);

  await context.setOffline(false);
  await expect(page.getByText("Waiting to sync")).toBeVisible();
  await page.getByRole("button", { name: /Delete entry at/ }).click();
  await expect(page.getByText(LONG_TEXT)).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});
