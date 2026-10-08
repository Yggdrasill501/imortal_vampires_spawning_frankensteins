import type { RefusalStage } from "@repo/contract";
import type { Lab, Trx } from "../app.ts";
import { iso } from "../time.ts";
import { loginHeld, readLogins, type HeldLogin } from "./logins.ts";
import { recordAction } from "./monster-log.ts";

export async function isInvited(trx: Trx, site: string): Promise<boolean> {
  const row = await trx
    .selectFrom("invitation_site")
    .select("site")
    .where("site", "=", site.toLowerCase())
    .executeTakeFirst();
  return Boolean(row);
}

export async function loginFor(lab: Lab, site: string): Promise<HeldLogin | null> {
  const logins = await readLogins(lab.config);
  const key = Object.keys(logins).find((name) => name.toLowerCase() === site.toLowerCase());
  if (!key) return null;
  return loginHeld(logins, key) ? logins[key]! : null;
}

export async function recordRefusal(
  lab: Lab,
  trx: Trx,
  input: {
    site: string;
    stage: RefusalStage;
    processId: string;
    toolName?: string | null;
    toolVersion?: number | null;
    runId?: string | null;
    monsterRunId?: string | null;
  },
) {
  const row = await trx
    .insertInto("refusal")
    .values({
      site: input.site,
      stage: input.stage,
      process_id: input.processId,
      tool_name: input.toolName ?? null,
      tool_version: input.toolVersion ?? null,
      run_id: input.runId ?? null,
      monster_run_id: input.monsterRunId ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  if (input.monsterRunId) {
    await recordAction(lab, trx, {
      monsterRunId: input.monsterRunId,
      kind: "refused",
      text: `The lab refused ${input.site}.`,
      toolName: input.toolName ?? null,
    });
  }

  return row;
}

export function refusalEvent(
  row: { id: string; site: string; process_id: string; run_id: string | null; monster_run_id: string | null; tool_name: string | null; at: Date | string },
) {
  return {
    kind: "refusal" as const,
    refusalId: row.id,
    site: row.site,
    processId: row.process_id,
    runId: row.run_id,
    monsterRunId: row.monster_run_id,
    tool: row.tool_name,
    at: iso(row.at),
  };
}
