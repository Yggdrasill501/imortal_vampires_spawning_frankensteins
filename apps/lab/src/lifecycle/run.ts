import type { Fact, RunKind, RunStatus } from "@repo/contract";
import { jsonb } from "@repo/db";
import type { Trx } from "../app.ts";

export async function createRun(
  trx: Trx,
  input: {
    processId: string;
    kind: RunKind;
    itemId: string;
    itemLabel: string;
    itemFields: Fact[];
    tickId?: string | null;
    monsterRunId?: string | null;
    steps: Array<{ toolId: string; toolVersionId: string }>;
  },
) {
  const run = await trx
    .insertInto("run")
    .values({
      process_id: input.processId,
      kind: input.kind,
      item_id: input.itemId,
      item_label: input.itemLabel,
      item_fields: jsonb(input.itemFields),
      tick_id: input.tickId ?? null,
      monster_run_id: input.monsterRunId ?? null,
      status: "pending",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  for (const [index, step] of input.steps.entries()) {
    await trx
      .insertInto("run_step")
      .values({
        run_id: run.id,
        position: index + 1,
        tool_id: step.toolId,
        tool_version_id: step.toolVersionId,
        status: "not_reached",
      })
      .execute();
  }
  return run;
}

export async function claimRun(trx: Trx, id: string): Promise<boolean> {
  const result = await trx
    .updateTable("run")
    .set({ status: "running", started_at: new Date() })
    .where("id", "=", id)
    .where("status", "=", "pending")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function finishRun(
  trx: Trx,
  id: string,
  outcome: Extract<RunStatus, "passed" | "failed" | "refused">,
  extra: {
    proofValue?: string | null;
    failedStep?: number | null;
    error?: string | null;
    modelCalls: number;
    startedAt: Date;
  },
): Promise<boolean> {
  const finishedAt = new Date();
  const result = await trx
    .updateTable("run")
    .set({
      status: outcome,
      finished_at: finishedAt,
      duration_ms: Math.max(0, finishedAt.getTime() - extra.startedAt.getTime()),
      proof_value: extra.proofValue ?? null,
      failed_step: extra.failedStep ?? null,
      error: extra.error ?? null,
      model_calls: extra.modelCalls,
    })
    .where("id", "=", id)
    .where("status", "=", "running")
    .executeTakeFirst();
  if (Number(result.numUpdatedRows) === 0) return false;
  if (outcome === "passed") {
    const run = await trx
      .selectFrom("run")
      .select(["process_id", "item_id"])
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("handled_item")
      .values({
        process_id: run.process_id,
        item_id: run.item_id,
        outcome: "passed",
        run_id: id,
      })
      .onConflict((oc) => oc.columns(["process_id", "item_id"]).doNothing())
      .execute();
  }
  return true;
}

export async function failPendingRun(trx: Trx, id: string, error: string): Promise<boolean> {
  const result = await trx
    .updateTable("run")
    .set({ status: "failed", error, finished_at: new Date(), duration_ms: 0 })
    .where("id", "=", id)
    .where("status", "=", "pending")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function setStepRunning(trx: Trx, runId: string, position: number, input: Fact[]) {
  await trx
    .updateTable("run_step")
    .set({
      status: "running",
      started_at: new Date(),
      input: jsonb(input),
    })
    .where("run_id", "=", runId)
    .where("position", "=", position)
    .execute();
}

export async function setStepEnded(
  trx: Trx,
  runId: string,
  position: number,
  status: "passed" | "failed" | "refused",
  result: Fact[] = [],
  error: string | null = null,
) {
  await trx
    .updateTable("run_step")
    .set({
      status,
      finished_at: new Date(),
      result: jsonb(result),
      error,
    })
    .where("run_id", "=", runId)
    .where("position", "=", position)
    .execute();
}

export function runStartedEvent(processId: string, runId: string) {
  return { kind: "run.started" as const, processId, runId };
}

export function runFinishedEvent(processId: string, runId: string, status: RunStatus) {
  return { kind: "run.finished" as const, processId, runId, status };
}
