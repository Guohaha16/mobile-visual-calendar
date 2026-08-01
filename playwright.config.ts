import { defineConfig } from "@playwright/test";

export default defineConfig({
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  outputDir: "test-results",
  projects: [
    {
      name: "phone-390",
      use: { viewport: { height: 844, width: 390 } },
    },
    {
      name: "phone-430",
      use: { viewport: { height: 932, width: 430 } },
    },
    {
      name: "desktop",
      use: { viewport: { height: 900, width: 1280 } },
    },
  ],
  reporter: [["list"]],
  retries: 0,
  testDir: "./e2e",
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    locale: "en-US",
    screenshot: "only-on-failure",
    serviceWorkers: "allow",
    timezoneId: "Asia/Shanghai",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173",
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:4173",
  },
  workers: 1,
});
