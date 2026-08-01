import {
  ensureServiceWorkerControl,
  expect,
  test,
} from "./fixtures";

test("provides install metadata and an offline application shell", async ({
  context,
  page,
  request,
}) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  await expect(manifestResponse.json()).resolves.toMatchObject({
    background_color: "#f2f2ef",
    display: "standalone",
    name: "Visual Calendar",
    short_name: "Calendar",
    start_url: "/",
    theme_color: "#f2f2ef",
  });

  await page.goto("/");
  await ensureServiceWorkerControl(page);
  const offlineState = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const cacheNames = await caches.keys();
    const cachedUrls = (
      await Promise.all(
        cacheNames.map(async (cacheName) => {
          const cache = await caches.open(cacheName);
          return (await cache.keys()).map((request) => request.url);
        }),
      )
    ).flat();
    return {
      cachedUrls,
      controller: navigator.serviceWorker.controller?.scriptURL,
      scope: registration.scope,
    };
  });
  expect(offlineState.controller).toContain("/sw.js");
  expect(offlineState.scope).toBe("http://127.0.0.1:4173/");
  expect(
    offlineState.cachedUrls.some(
      (url) => new URL(url).pathname === "/index.html",
    ),
  ).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("main", { name: "Visual diary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open July 2026" })).toBeVisible();
  await context.setOffline(false);
});
