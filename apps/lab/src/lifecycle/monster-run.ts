import type { MonsterRunKind, MonsterRunStatus } from "@repo/contract";
import type { Trx } from "../app.ts";

export async function queueMonsterRun(
  trx: Trx,
  input: { processId: string; kind: MonsterRunKind; model: string; failedRunId?: string },
) {
  return trx
    .insertInto("monster_run")
    .values({
      process_id: input.processId,
      kind: input.kind,
      model: input.model,
      status: "queued",
      failed_run_id: input.kind === "repair" ? input.failedRunId ?? null : null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function claimMonsterRun(trx: Trx, id: string): Promise<boolean> {
  const result = await trx
    .updateTable("monster_run")
    .set({ status: "running", started_at: new Date() })
    .where("id", "=", id)
    .where("status", "=", "queued")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function verifyMonsterRun(trx: Trx, id: string): Promise<boolean> {
  const result = await trx
    .updateTable("monster_run")
    .set({ status: "verified", ended_at: new Date() })
    .where("id", "=", id)
    .where("status", "=", "running")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function failMonsterRun(
  trx: Trx,
  id: string,
  reason: string,
  from: MonsterRunStatus | MonsterRunStatus[] = "running",
): Promise<boolean> {
  const allowed = Array.isArray(from) ? from : [from];
  const result = await trx
    .updateTable("monster_run")
    .set({ status: "failed", ended_at: new Date(), reason })
    .where("id", "=", id)
    .where("status", "in", allowed)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export function monsterStatusEvent(
  processId: string,
  monsterRunId: string,
  status: MonsterRunStatus,
) {
  return { kind: "monster.status" as const, processId, monsterRunId, status };
}
