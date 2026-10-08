import type { Fact } from "@repo/contract";
import type { Lab } from "../app.ts";
import { ensureStop } from "../errors.ts";
import * as processLife from "../lifecycle/process.ts";
import * as runLife from "../lifecycle/run.ts";
import { queueMonsterRun } from "../lifecycle/monster-run.ts";

export async function runPipeline(lab: Lab, runId: string, signal: AbortSignal): Promise<void> {
  const run = await lab.db.selectFrom("run").selectAll().where("id", "=", runId).executeTakeFirst();
  if (!run) return;
  const process = await lab.db
    .selectFrom("process")
    .selectAll()
    .where("id", "=", run.process_id)
    .executeTakeFirst();
  if (!process) return;

  const outcome = await lab.seams.runner.runItem({
    runId,
    processId: run.process_id,
    item: {
      id: run.item_id,
      label: run.item_label,
      fields: Array.isArray(run.item_fields) ? (run.item_fields as unknown as Fact[]) : [],
    },
    hooks: {
      async stepStarted(position, input) {
        await lab.db.transaction().execute(async (trx) => {
          await runLife.setStepRunning(trx, runId, position, input);
        });
      },
      async stepEnded(input) {
        await lab.db.transaction().execute(async (trx) => {
          await runLife.setStepEnded(trx, runId, input.position, input.status, input.result ?? [], input.error ?? null);
        });
      },
    },
    signal,
  });

  const startedAt = run.started_at ? new Date(run.started_at) : new Date();
  await lab.db.transaction().execute(async (trx) => {
    await runLife.finishRun(trx, runId, outcome.status, {
      proofValue: outcome.proofValue,
      failedStep: outcome.failedStep,
      error: outcome.error ? ensureStop(outcome.error) : null,
      modelCalls: outcome.modelCalls,
      startedAt,
    });
    if (process.status === "sealed" && (run.kind === "scheduled" || run.kind === "run_now")) {
      if (outcome.status === "failed") {
        const monster = await queueMonsterRun(trx, {
          processId: process.id,
          kind: "repair",
          model: lab.config.model,
          failedRunId: runId,
        });
        await processLife.markRepairing(trx, process.id, monster.id);
        lab.events.emit(processLife.processStatusEvent(process.id, "repairing"));
        lab.events.emit({ kind: "monster.status", processId: process.id, monsterRunId: monster.id, status: "queued" });
      } else if (outcome.status === "refused") {
        await processLife.markNeedsHuman(
          trx,
          process.id,
          { reason: ensureStop(outcome.error ?? "The run was refused."), causeRunId: runId },
          "sealed",
        );
        lab.events.emit(processLife.processStatusEvent(process.id, "needs_human"));
      }
    }
  });
  lab.events.emit(runLife.runFinishedEvent(process.id, runId, outcome.status));
}
