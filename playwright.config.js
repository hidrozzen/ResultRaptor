// playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',          // testDir top level
  timeout: 60 * 1000,
  use: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // You can put semester and rolls here as env variables if you want to access inside tests
        // or just read from a separate config file in your test code.
      },
    },
  ],
});
