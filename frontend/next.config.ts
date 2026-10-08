import type { NextConfig } from "next";

// All browser calls go to same-origin /api/*, which Next proxies to FastAPI.
// That keeps the session cookie first-party (no cross-site cookie problems on Vercel).
const BACKEND_URL = (process.env.BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // E2E builds into its own directory so it can run next to a dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
