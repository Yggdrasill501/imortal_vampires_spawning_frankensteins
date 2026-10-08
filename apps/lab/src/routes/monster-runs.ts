import type { FastifyInstance } from "fastify";
import { PATHS } from "@repo/contract";
import { monsterRunView } from "../views.ts";

export function monsterRunRoutes(app: FastifyInstance) {
  app.get(PATHS.monsterRuns, async (request) => {
    const query = request.query as { processId?: string };
    let q = app.lab.db.selectFrom("monster_run").select("id").orderBy("created_at", "desc").limit(100);
    if (query.processId) q = q.where("process_id", "=", query.processId);
    const rows = await q.execute();
    const monsterRuns = [];
    for (const row of rows) {
      const view = await app.lab.db.transaction().execute((trx) => monsterRunView(app.lab, trx, row.id));
      if (view) monsterRuns.push(view);
    }
    return { monsterRuns };
  });
}
