import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "kysely-ctl";
import { db } from "./src/index";

const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

export default defineConfig({
  kysely: db,
  migrations: {
    migrationFolder: "migrations",
  },
});
