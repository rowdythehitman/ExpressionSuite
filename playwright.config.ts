import { defineConfig } from "@playwright/test";
import { existsSync } from "fs";

// Cloud dev containers ship Chromium here; CI installs Playwright's own.
const localChromium = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1000, height: 600 },
    trace: "retain-on-failure",
    launchOptions: existsSync(localChromium) ? { executablePath: localChromium } : {},
  },
  webServer: {
    command: "npx cross-env BROWSER_ONLY=true vite --port 3000 --strictPort",
    url: "http://localhost:3000/ide/index.html",
    reuseExistingServer: !process.env.CI,
  },
});
