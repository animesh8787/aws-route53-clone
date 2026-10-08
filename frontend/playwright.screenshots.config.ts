import { defineConfig } from "@playwright/test";

import base from "./playwright.config";

/** `npm run screenshots` regenerates docs/screenshots against the isolated E2E stack. */
export default defineConfig({
  ...base,
  testDir: "./e2e/screenshots",
  testIgnore: undefined,
});
