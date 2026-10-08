import type { FastifyInstance } from "fastify";
import { PATHS } from "@repo/contract";
import { invalid } from "../errors.ts";
import { runView } from "../views.ts";

export function runRoutes(app: FastifyInstance) {
  app.get(PATHS.runs, async (request) => {
    const query = request.query as { processId?: string; limit?: string };
    const limit = query.limit === undefined ? 200 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw invalid("The limit is not valid.");
    let q = app.lab.db.selectFrom("run").select("id").orderBy("created_at", "desc").limit(limit);
    if (query.processId) q = q.where("process_id", "=", query.processId);
    const rows = await q.execute();
    const runs = [];
    for (const row of rows) {
      const view = await app.lab.db.transaction().execute((trx) => runView(app.lab, trx, row.id));
      if (view) runs.push(view);
    }
    return { runs };
  });
}
