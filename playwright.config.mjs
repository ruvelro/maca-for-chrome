export default {
  testDir: "./tests",
  testMatch: /.*\.spec\.mjs$/,
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    channel: process.env.PLAYWRIGHT_EXTENSION_CHANNEL || "msedge",
    headless: false
  }
};
