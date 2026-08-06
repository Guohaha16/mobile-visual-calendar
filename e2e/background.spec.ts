import { expect, test } from "@playwright/test";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const seedDiaryImages = async (
  page: import("@playwright/test").Page,
  count: number,
) => {
  await page.evaluate(
    async ({ imageBase64, imageCount }) => {
      const databaseName =
        "mobile-visual-calendar::user:00000000-0000-4000-8000-000000000001";
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const bytes = Uint8Array.from(atob(imageBase64), (character) =>
        character.charCodeAt(0),
      );
      const transaction = database.transaction(["entries", "media"], "readwrite");
      const entries = transaction.objectStore("entries");
      const media = transaction.objectStore("media");
      const userId = "00000000-0000-4000-8000-000000000001";

      for (let index = 0; index < imageCount; index += 1) {
        const day = String(index + 1).padStart(2, "0");
        const createdAt = `2026-07-${day}T12:00:00.000Z`;
        const entryId = `seed-entry-${index}`;
        entries.put({
          createdAt,
          entryDate: `2026-07-${day}`,
          id: entryId,
          media: [],
          syncState: "local",
          text: "",
          updatedAt: createdAt,
          userId,
        });
        const blob = new Blob([bytes], { type: "image/png" });
        media.put({
          createdAt,
          entryId,
          id: `seed-media-${index}`,
          localBlob: blob,
          mimeType: "image/png",
          sortOrder: 0,
          thumbnailBlob: blob,
          userId,
        });
      }

      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    { imageBase64: ONE_PIXEL_PNG_BASE64, imageCount: count },
  );
};

test("keeps home and individual month background choices independent", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Choose background" }).click();
  await page.getByRole("button", { name: "Random background" }).click();
  await expect(
    page.getByRole("button", { name: "Close background picker" }),
  ).toHaveCount(0);

  await page.goto("/calendar/2026/07");
  await page.getByRole("button", { name: "Choose background" }).click();
  await expect(
    page.getByRole("button", {
      name: "Use exhibition white background",
    }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Random background" }).click();
  await expect(
    page.getByRole("button", { name: "Close background picker" }),
  ).toHaveCount(0);
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

test("scrolls through a full month of diary backgrounds", async ({ page }) => {
  await page.goto("/");
  await seedDiaryImages(page, 30);
  await page.reload();

  await page.getByRole("button", { name: "Choose background" }).click();
  const images = page.getByRole("button", { name: /Use diary image from/ });
  await expect(images).toHaveCount(30);

  const grid = page
    .getByRole("region", { name: "Diary background images" });

  await expect
    .poll(() =>
      grid.evaluate((element) => element.scrollHeight > element.clientHeight),
    )
    .toBe(true);
  await expect(grid).toHaveCSS("touch-action", "pan-y");
  const [firstCard, secondRowCard] = await Promise.all([
    images.first().boundingBox(),
    images.nth(3).boundingBox(),
  ]);
  expect(firstCard).not.toBeNull();
  expect(secondRowCard).not.toBeNull();
  expect(secondRowCard?.y ?? 0).toBeGreaterThanOrEqual(
    (firstCard?.y ?? 0) + (firstCard?.height ?? 0),
  );
  await grid.hover();
  await page.mouse.wheel(0, 10_000);
  await expect
    .poll(() => grid.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(images.last()).toBeInViewport();
});
