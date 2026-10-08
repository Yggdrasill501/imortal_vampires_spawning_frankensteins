import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Env lives in a single .env at the monorepo root, shared with packages/db.
const rootEnv = path.join(process.cwd(), "../../.env");
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
