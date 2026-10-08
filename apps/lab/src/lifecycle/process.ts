import type { ProcessStatus } from "@repo/contract";
import type { Trx } from "../app.ts";
import { queueMonsterRun } from "./monster-run.ts";
import { failPendingRun } from "./run.ts";
import { failMonsterRun } from "./monster-run.ts";
import { finishTick } from "./tick.ts";

export async function queueLearn(
  trx: Trx,
  processId: string,
  model: string,
  from: ProcessStatus,
) {
  const monster = await queueMonsterRun(trx, { processId, kind: "learn", model });
  const result = await trx
    .updateTable("process")
    .set({
      status: "queued",
      current_monster_run_id: monster.id,
      reason: null,
    })
    .where("id", "=", processId)
    .where("status", "=", from)
    .executeTakeFirst();
  if (Number(result.numUpdatedRows) === 0) return null;
  return monster;
}

export async function markLearning(trx: Trx, processId: string): Promise<boolean> {
  const result = await trx
    .updateTable("process")
    .set({ status: "learning" })
    .where("id", "=", processId)
    .where("status", "=", "queued")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function markAwaitingSeal(
  trx: Trx,
  processId: string,
  verificationRunId: string,
): Promise<boolean> {
  const result = await trx
    .updateTable("process")
    .set({ status: "awaiting_seal", verification_run_id: verificationRunId })
    .where("id", "=", processId)
    .where("status", "=", "learning")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function markFailedToLearn(
  trx: Trx,
  processId: string,
  reason: string,
): Promise<boolean> {
  const result = await trx
    .updateTable("process")
    .set({ status: "failed_to_learn", reason })
    .where("id", "=", processId)
    .where("status", "=", "learning")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function sealProcess(
  trx: Trx,
  processId: string,
  nextRunAt: Date | null,
): Promise<boolean> {
  const result = await trx
    .updateTable("process")
    .set({
      status: "sealed",
      sealed_at: new Date(),
      next_run_at: nextRunAt,
    })
    .where("id", "=", processId)
    .where("status", "=", "awaiting_seal")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function markRepairing(
  trx: Trx,
  processId: string,
  monsterRunId: string,
): Promise<boolean> {
  const result = await trx
    .updateTable("process")
    .set({
      status: "repairing",
      next_run_at: null,
      current_monster_run_id: monsterRunId,
    })
    .where("id", "=", processId)
    .where("status", "=", "sealed")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function resealAfterRepair(
  trx: Trx,
  processId: string,
  repairId: string,
  nextRunAt: Date | null,
): Promise<boolean> {
  const result = await trx
    .updateTable("process")
    .set({
      status: "sealed",
      repaired: true,
      latest_repair_id: repairId,
      next_run_at: nextRunAt,
      reason: null,
      cause_run_id: null,
      cause_refusal_id: null,
    })
    .where("id", "=", processId)
    .where("status", "=", "repairing")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function markNeedsHuman(
  trx: Trx,
  processId: string,
  input: { reason: string; causeRunId: string; causeRefusalId?: string | null },
  from: ProcessStatus | ProcessStatus[],
): Promise<boolean> {
  const allowed = Array.isArray(from) ? from : [from];
  const result = await trx
    .updateTable("process")
    .set({
      status: "needs_human",
      reason: input.reason,
      cause_run_id: input.causeRunId,
      cause_refusal_id: input.causeRefusalId ?? null,
      next_run_at: null,
    })
    .where("id", "=", processId)
    .where("status", "in", allowed)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function resumeProcess(
  trx: Trx,
  processId: string,
  nextRunAt: Date | null,
): Promise<boolean> {
  const row = await trx
    .selectFrom("process")
    .select(["cause_run_id"])
    .where("id", "=", processId)
    .where("status", "=", "needs_human")
    .executeTakeFirst();
  if (!row?.cause_run_id) return false;
  const run = await trx
    .selectFrom("run")
    .select(["item_id"])
    .where("id", "=", row.cause_run_id)
    .executeTakeFirst();
  if (run) {
    await trx
      .insertInto("handled_item")
      .values({
        process_id: processId,
        item_id: run.item_id,
        outcome: "set_aside",
        run_id: row.cause_run_id,
      })
      .onConflict((oc) => oc.columns(["process_id", "item_id"]).doNothing())
      .execute();
  }
  const result = await trx
    .updateTable("process")
    .set({
      status: "sealed",
      reason: null,
      cause_run_id: null,
      cause_refusal_id: null,
      next_run_at: nextRunAt,
    })
    .where("id", "=", processId)
    .where("status", "=", "needs_human")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function retireProcess(trx: Trx, processId: string): Promise<boolean> {
  const result = await trx
    .updateTable("process")
    .set({ status: "retired", retired_at: new Date(), next_run_at: null, reason: null, cause_run_id: null, cause_refusal_id: null })
    .where("id", "=", processId)
    .where("status", "<>", "retired")
    .executeTakeFirst();
  if (Number(result.numUpdatedRows) === 0) return false;

  const queuedMonster = await trx
    .selectFrom("monster_run")
    .select("id")
    .where("process_id", "=", processId)
    .where("status", "=", "queued")
    .executeTakeFirst();
  if (queuedMonster) {
    await failMonsterRun(trx, queuedMonster.id, "The process was retired.", "queued");
  }
  const queuedTick = await trx
    .selectFrom("tick")
    .select("id")
    .where("process_id", "=", processId)
    .where("status", "=", "queued")
    .executeTakeFirst();
  if (queuedTick) await finishTick(trx, queuedTick.id, 0);
  const pending = await trx
    .selectFrom("run")
    .select("id")
    .where("process_id", "=", processId)
    .where("status", "=", "pending")
    .execute();
  for (const run of pending) {
    await failPendingRun(trx, run.id, "The process was retired before this ran.");
  }
  return true;
}

export async function setSchedule(
  trx: Trx,
  processId: string,
  schedule: { kind: "daily"; time: string } | { kind: "every"; minutes: number },
  nextRunAt: Date | null,
): Promise<boolean> {
  const result = await trx
    .updateTable("process")
    .set({
      schedule_kind: schedule.kind,
      schedule_time: schedule.kind === "daily" ? schedule.time : null,
      schedule_minutes: schedule.kind === "every" ? schedule.minutes : null,
      next_run_at: nextRunAt,
    })
    .where("id", "=", processId)
    .where("status", "not in", ["proposed", "retired"])
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function setNextRunAt(trx: Trx, processId: string, nextRunAt: Date | null) {
  await trx.updateTable("process").set({ next_run_at: nextRunAt }).where("id", "=", processId).execute();
}

export function processStatusEvent(processId: string, status: ProcessStatus) {
  return { kind: "process.status" as const, processId, status };
}
