import { Kysely, PostgresDialect, sql } from "kysely";
import type { RawBuilder } from "kysely";
import { Pool } from "pg";
import type { DB, Json } from "./schema";

export type { DB, Json } from "./schema";
export { sql };
export type { Kysely, Transaction } from "kysely";

/** Bind a JS value as jsonb. Avoid `::jsonb` — Kysely treats `:` as a named parameter. */
export function jsonb(value: unknown): RawBuilder<Json> {
  return sql<Json>`cast(${JSON.stringify(value)} as jsonb)`;
}

export function createDatabase(connectionString: string): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString }),
    }),
  });
}

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
