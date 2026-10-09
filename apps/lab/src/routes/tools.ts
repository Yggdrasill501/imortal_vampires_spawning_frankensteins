import type { FastifyInstance } from "fastify";
import { PATHS } from "@repo/contract";
import { NOT_FOUND } from "../errors.ts";
import { toolSummary, toolView } from "../views.ts";

export function toolRoutes(app: FastifyInstance) {
  app.get(PATHS.tools, async () => {
    const rows = await app.lab.db.selectFrom("tool").select("name").where("current_version_id", "is not", null).orderBy("created_at").execute();
    const tools = [];
    for (const row of rows) {
      const view = await app.lab.db.transaction().execute((trx) => toolSummary(app.lab, trx, row.name));
      if (view) tools.push(view);
    }
    return { tools };
  });

  app.get("/tools/:name", async (request) => {
    const { name } = request.params as { name: string };
    const view = await app.lab.db.transaction().execute((trx) => toolView(app.lab, trx, name));
    if (!view) throw NOT_FOUND;
    return view;
  });
}
