import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { DB } from "./schema";

export type { DB } from "./schema";
export { sql } from "kysely";

function createDb() {
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      // Resolved on first query, so importing this module never needs a database.
      pool: async () => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
          throw new Error("DATABASE_URL is not set");
        }
        return new Pool({ connectionString });
      },
    }),
  });
}

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as typeof globalThis & { __db?: Kysely<DB> };

export const db = (globalForDb.__db ??= createDb());
