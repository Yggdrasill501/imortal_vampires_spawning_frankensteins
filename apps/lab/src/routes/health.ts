import type { FastifyInstance } from "fastify";
import type { HealthResponse } from "@repo/contract";
import { PATHS } from "@repo/contract";
import { sql } from "@repo/db";

export function healthRoutes(app: FastifyInstance) {
  app.get(PATHS.health, async (): Promise<HealthResponse> => {
    let database: HealthResponse["database"] = "error";
    if (app.lab.dbReady) {
      try {
        await Promise.race([
          app.lab.db.selectFrom("interview").select(sql`1`.as("one")).limit(1).execute(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
        ]);
        database = "ok";
      } catch {
        database = "error";
      }
    }
    return { service: "ok", database };
  });
}
