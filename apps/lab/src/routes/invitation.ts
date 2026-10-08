import type { FastifyInstance } from "fastify";
import { PATHS, type PutInvitationRequest } from "@repo/contract";
import { applyInvitation } from "../store/invitation.ts";
import { readLogins, writeLogins } from "../store/logins.ts";
import { invitationView } from "../views.ts";

export function invitationRoutes(app: FastifyInstance) {
  app.get(PATHS.invitation, async () => {
    return app.lab.db.transaction().execute((trx) => invitationView(app.lab, trx));
  });

  app.put(PATHS.invitation, async (request) => {
    const body = request.body as PutInvitationRequest;
    const sites = Array.isArray(body?.sites) ? body.sites : [];
    const processSites = await app.lab.db
      .selectFrom("process_site")
      .innerJoin("process", "process.id", "process_site.process_id")
      .select([
        "process_site.site",
        "process_site.kind",
        "process_site.login_needed",
        "process.id as process_id",
        "process.name as process_name",
        "process.status as process_status",
      ])
      .execute();
    const neededByAny = new Map<string, { kind: "website" | "connector"; loginNeeded: boolean }>();
    const neededByUnretired = new Map<string, string[]>();
    for (const row of processSites) {
      neededByAny.set(row.site, { kind: row.kind as "website" | "connector", loginNeeded: row.login_needed });
      if (row.process_status !== "retired") {
        const names = neededByUnretired.get(row.site) ?? [];
        if (!names.includes(row.process_name)) names.push(row.process_name);
        neededByUnretired.set(row.site, names);
      }
    }
    const currentLogins = await readLogins(app.lab.config);
    const next = await app.lab.db.transaction().execute(async (trx) => {
      const logins = await applyInvitation(trx, sites, neededByUnretired, neededByAny, currentLogins);
      await writeLogins(app.lab.config, logins);
      return invitationView(app.lab, trx);
    });
    return next;
  });
}
