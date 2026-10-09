import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "@playwright/test";

const FRONTEND_PORT = 3100;
const BACKEND_PORT = 8100;
const isWindows = process.platform === "win32";
// Start every run from an empty database (workers also load this file, so only the main process clears it).
if (process.env.TEST_WORKER_INDEX === undefined) fs.rmSync(path.resolve("..", "backend", "e2e.db"), { force: true });
const python = path.resolve("..", "backend", ".venv", isWindows ? "Scripts" : "bin", isWindows ? "python.exe" : "python");

/**
 * E2E runs against an isolated stack (own ports and a throw-away SQLite file) so it never
 * touches the development database. Set PW_CHANNEL=chrome|msedge to use an installed browser
 * instead of Playwright's bundled Chromium.
 */
const config = defineConfig({
  testDir: "./e2e",
  testIgnore: "**/screenshots/**",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    channel: process.env.PW_CHANNEL || undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: `"${python}" -m uvicorn app.main:app --port ${BACKEND_PORT}`,
      cwd: "../backend",
      port: BACKEND_PORT,
      env: { DATABASE_URL: "sqlite:///./e2e.db", SEED_ON_START: "true", CORS_ORIGINS: `http://127.0.0.1:${FRONTEND_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx next build && npx next start -p ${FRONTEND_PORT}`,
      port: FRONTEND_PORT,
      env: { BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}`, NEXT_DIST_DIR: ".next-e2e" },
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});

export default config;
