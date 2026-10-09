import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Lab } from "../app.ts";
import { agentEnvironment } from "../config.ts";
import { ensureStop } from "../errors.ts";
import * as monsterLife from "../lifecycle/monster-run.ts";
import * as processLife from "../lifecycle/process.ts";
import * as runLife from "../lifecycle/run.ts";
import { scheduleOf } from "../views.ts";
import { currentSteps, learnHooks, verificationLine } from "./learn.ts";

const ONLY_REPAIR = { error: "A repair may only submit a new version of the failing tool." };

export async function repairPipeline(lab: Lab, monsterRunId: string, signal: AbortSignal): Promise<void> {
  const monster = await lab.db
    .selectFrom("monster_run")
    .selectAll()
    .where("id", "=", monsterRunId)
    .executeTakeFirst();
  if (!monster || !monster.failed_run_id) return;
  const processId = monster.process_id;
  const failedRun = await lab.db
    .selectFrom("run")
    .selectAll()
    .where("id", "=", monster.failed_run_id)
    .executeTakeFirst();
  const step = failedRun
    ? await lab.db
        .selectFrom("run_step")
        .innerJoin("tool", "tool.id", "run_step.tool_id")
        .innerJoin("tool_version", "tool_version.id", "run_step.tool_version_id")
        .select([
          "run_step.tool_id",
          "run_step.tool_version_id",
          "run_step.error",
          "tool.name",
          "tool_version.version",
        ])
        .where("run_step.run_id", "=", failedRun.id)
        .where("run_step.position", "=", failedRun.failed_step ?? 1)
        .executeTakeFirst()
    : undefined;
  if (!failedRun || !step) return;

  const workspace = path.join(lab.config.dataDir, "workspaces", monsterRunId);
  await mkdir(workspace, { recursive: true });
  const base = learnHooks(lab, { monsterRunId, processId, workspace, signal });
  let candidateFolder: string | null = null;

  lab.log.info({ seam: "monster", record: monsterRunId }, "seam start");
  let result;
  try {
    result = await lab.seams.monster.work({
      monsterRunId,
      processId,
      kind: "repair",
      workspace,
      model: monster.model,
      agentEnvironment: agentEnvironment(lab.config),
      hooks: {
        readShelf: base.readShelf,
        recordAction: base.recordAction,
        reportTokens: base.reportTokens,
        createTool: async () => ONLY_REPAIR,
        takeTool: async () => ONLY_REPAIR,
        saveProcess: async () => ONLY_REPAIR,
        async submitRepair(draftFolder) {
          // The candidate is installed and checked by the lab once the session has ended.
          candidateFolder = draftFolder;
        },
      },
      signal,
    });
  } catch (error) {
    lab.log.error({ err: error, record: monsterRunId }, "monster");
    result = { outcome: "gave_up" as const, error: "The lab failed while doing this." };
  }
  lab.log.info({ seam: "monster", record: monsterRunId, outcome: result.outcome }, "seam end");

  const whatFailed = ensureStop(step.error ?? failedRun.error ?? "The tool failed.");
  const record = async (input: {
    result: "verified" | "not_fixed";
    whatChanged: string;
    reason: string | null;
    toVersionId: string | null;
    retryRunId: string | null;
  }) =>
    lab.db.transaction().execute(async (trx) => {
      const repair = await trx
        .insertInto("repair")
        .values({
          tool_id: step.tool_id,
          process_id: processId,
          monster_run_id: monsterRunId,
          from_version_id: step.tool_version_id,
          to_version_id: input.toVersionId,
          failed_run_id: failedRun.id,
          retry_run_id: input.retryRunId,
          item_label: failedRun.item_label,
          what_failed: whatFailed,
          what_changed: input.whatChanged,
          result: input.result,
          reason: input.reason,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx.updateTable("run").set({ repair_id: repair.id }).where("id", "=", failedRun.id).execute();
      return repair.id;
    });

  const notFixed = async (reason: string, whatChanged = "", retryRunId: string | null = null) => {
    const repairId = await record({ result: "not_fixed", whatChanged, reason, toVersionId: null, retryRunId });
    await lab.db.transaction().execute(async (trx) => {
      await monsterLife.failMonsterRun(trx, monsterRunId, reason);
      await processLife.markNeedsHuman(trx, processId, { reason, causeRunId: failedRun.id }, "repairing");
    });
    lab.events.emit({ kind: "repair.recorded", repairId, tool: step.name, processId });
    lab.events.emit(monsterLife.monsterStatusEvent(processId, monsterRunId, "failed"));
    lab.events.emit(processLife.processStatusEvent(processId, "needs_human"));
  };

  if (result.outcome === "gave_up" || !candidateFolder) {
    await notFixed(result.outcome === "gave_up" ? ensureStop(result.error) : "The agent produced no candidate.");
    return;
  }
  const whatChanged = ensureStop(result.whatChanged ?? "The tool was changed.");

  // The candidate becomes the newest version on the shelf, which is the one a run uses.
  const version = step.version + 1;
  const codePath = `${step.name}/v${version}`;
  const installed = path.join(lab.config.shelfDir, codePath);
  await cp(candidateFolder, installed, { recursive: true });

  const settle = await verificationLine(
    lab,
    monsterRunId,
    processId,
    `Running the failed item, ${failedRun.item_label}, again with the candidate, in the sandbox, with no model.`,
  );
  const candidate = await lab.db.transaction().execute(async (trx) =>
    trx
      .insertInto("tool_version")
      .values({
        tool_id: step.tool_id,
        version,
        code_path: codePath,
        origin_kind: "repair",
        monster_run_id: monsterRunId,
      })
      .returning("id")
      .executeTakeFirstOrThrow(),
  );
  const steps = (await currentSteps(lab, processId)).map((entry) =>
    entry.toolId === step.tool_id ? { ...entry, toolVersionId: candidate.id } : entry,
  );
  const item = {
    id: failedRun.item_id,
    label: failedRun.item_label,
    fields: Array.isArray(failedRun.item_fields) ? (failedRun.item_fields as never) : [],
  };
  const retry = await lab.db.transaction().execute(async (trx) => {
    const created = await runLife.createRun(trx, {
      processId,
      kind: "after_repair",
      itemId: item.id,
      itemLabel: item.label,
      itemFields: item.fields,
      monsterRunId,
      steps,
    });
    await runLife.claimRun(trx, created.id);
    return created;
  });
  lab.events.emit(runLife.runStartedEvent(processId, retry.id));
  const retryStarted = new Date();
  const outcome = await lab.seams.runner.runItem({
    runId: retry.id,
    processId,
    item,
    hooks: {
      async stepStarted(position, input) {
        await lab.db.transaction().execute((trx) => runLife.setStepRunning(trx, retry.id, position, input));
      },
      async stepEnded(ended) {
        await lab.db
          .transaction()
          .execute((trx) =>
            runLife.setStepEnded(trx, retry.id, ended.position, ended.status, ended.result ?? [], ended.error ?? null),
          );
      },
    },
    signal,
  });
  await lab.db.transaction().execute((trx) =>
    runLife.finishRun(trx, retry.id, outcome.status, {
      proofValue: outcome.proofValue,
      failedStep: outcome.failedStep,
      error: outcome.error ? ensureStop(outcome.error) : null,
      modelCalls: outcome.modelCalls,
      startedAt: retryStarted,
    }),
  );
  lab.events.emit(runLife.runFinishedEvent(processId, retry.id, outcome.status));
  await settle(outcome.status === "passed" ? "passed" : "failed");

  if (outcome.status !== "passed") {
    // The old version is the newest on the shelf again.
    await rm(installed, { recursive: true, force: true });
    await notFixed(
      ensureStop(outcome.error ?? "The failed item did not pass with the candidate."),
      whatChanged,
      retry.id,
    );
    return;
  }

  const process = await lab.db.selectFrom("process").selectAll().where("id", "=", processId).executeTakeFirstOrThrow();
  const next = await lab.seams.scheduling.nextRunAt(scheduleOf(process), new Date(), signal);
  const repairId = await record({
    result: "verified",
    whatChanged,
    reason: null,
    toVersionId: candidate.id,
    retryRunId: retry.id,
  });
  await lab.db.transaction().execute(async (trx) => {
    await trx
      .updateTable("tool_version")
      .set({ became_current_at: new Date() })
      .where("id", "=", candidate.id)
      .execute();
    await trx.updateTable("tool").set({ current_version_id: candidate.id }).where("id", "=", step.tool_id).execute();
    await monsterLife.verifyMonsterRun(trx, monsterRunId);
    await processLife.resealAfterRepair(trx, processId, repairId, next);
  });
  lab.events.emit({ kind: "tool.version_current", tool: step.name, version });
  lab.events.emit({ kind: "repair.recorded", repairId, tool: step.name, processId });
  lab.events.emit(monsterLife.monsterStatusEvent(processId, monsterRunId, "verified"));
  lab.events.emit(processLife.processStatusEvent(processId, "sealed"));
}
