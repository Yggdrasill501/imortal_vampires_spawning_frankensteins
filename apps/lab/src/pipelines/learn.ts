import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { ActionKind } from "@repo/contract";
import type { Lab } from "../app.ts";
import { agentEnvironment } from "../config.ts";
import { ensureStop } from "../errors.ts";
import * as monsterLife from "../lifecycle/monster-run.ts";
import * as processLife from "../lifecycle/process.ts";
import * as runLife from "../lifecycle/run.ts";
import { readProcessFile } from "../monster/workspace.ts";
import type { MonsterHooks } from "../seams/types.ts";
import { recordRefusal, refusalEvent } from "../store/gate.ts";
import {
  actionView,
  addVerificationLine,
  recordAction,
  setTokens,
  setVerificationOutcome,
} from "../store/monster-log.ts";
import { installDraft, reuseTool, saveChain, withdrawCreatedTools } from "../store/shelf-index.ts";
import { iso } from "../time.ts";
import { saveChainFile } from "../wiring/chain.ts";

export async function learnPipeline(lab: Lab, monsterRunId: string, signal: AbortSignal): Promise<void> {
  const monster = await lab.db
    .selectFrom("monster_run")
    .selectAll()
    .where("id", "=", monsterRunId)
    .executeTakeFirst();
  if (!monster) return;
  const processId = monster.process_id;
  const workspace = path.join(lab.config.dataDir, "workspaces", monsterRunId);
  await mkdir(workspace, { recursive: true });

  lab.log.info({ seam: "monster", record: monsterRunId }, "seam start");
  const started = Date.now();
  let result;
  try {
    result = await lab.seams.monster.work({
      monsterRunId,
      processId,
      kind: "learn",
      workspace,
      model: monster.model,
      agentEnvironment: agentEnvironment(lab.config),
      hooks: learnHooks(lab, { monsterRunId, processId, workspace, signal }),
      signal,
    });
  } catch (error) {
    lab.log.error({ err: error, record: monsterRunId }, "monster");
    result = { outcome: "gave_up" as const, error: "The lab failed while doing this." };
  }
  lab.log.info(
    { seam: "monster", record: monsterRunId, duration: Date.now() - started, outcome: result.outcome },
    "seam end",
  );

  const steps = await currentSteps(lab, processId);
  if (result.outcome === "gave_up" || steps.length === 0) {
    const reason =
      result.outcome === "gave_up" ? ensureStop(result.error) : "The agent did not save a process.";
    await failLearn(lab, monsterRunId, processId, reason);
    return;
  }

  // From here the lab checks the work itself. Nothing the agent said is used.
  const listing = await verificationLine(lab, monsterRunId, processId, "Listing the incoming work with the saved chain.");
  const listed = await lab.seams.runner.listItems({ processId, signal });
  await listing("error" in listed ? "failed" : "passed");
  if ("error" in listed) {
    await failLearn(lab, monsterRunId, processId, ensureStop(listed.error));
    return;
  }
  const second = listed.items[1];
  if (!second) {
    await failLearn(
      lab,
      monsterRunId,
      processId,
      "There was no second example to check the work on. Two pieces of incoming work are needed.",
    );
    return;
  }

  const running = await verificationLine(
    lab,
    monsterRunId,
    processId,
    `Running the saved chain on a second example, ${second.label}, in the sandbox, with no model.`,
  );
  const run = await lab.db.transaction().execute(async (trx) => {
    const created = await runLife.createRun(trx, {
      processId,
      kind: "verification",
      itemId: second.id,
      itemLabel: second.label,
      itemFields: second.fields,
      monsterRunId,
      steps,
    });
    await runLife.claimRun(trx, created.id);
    return created;
  });
  lab.events.emit(runLife.runStartedEvent(processId, run.id));
  const runStarted = new Date();
  const outcome = await lab.seams.runner.runItem({
    runId: run.id,
    processId,
    item: second,
    hooks: {
      async stepStarted(position, input) {
        await lab.db.transaction().execute((trx) => runLife.setStepRunning(trx, run.id, position, input));
      },
      async stepEnded(step) {
        await lab.db
          .transaction()
          .execute((trx) =>
            runLife.setStepEnded(trx, run.id, step.position, step.status, step.result ?? [], step.error ?? null),
          );
      },
    },
    signal,
  });
  await lab.db.transaction().execute(async (trx) => {
    await runLife.finishRun(trx, run.id, outcome.status, {
      proofValue: outcome.proofValue,
      failedStep: outcome.failedStep,
      error: outcome.error ? ensureStop(outcome.error) : null,
      modelCalls: outcome.modelCalls,
      startedAt: runStarted,
    });
    if (outcome.status === "passed") {
      // Work that was already waiting while the process was learned is not done again once it is sealed.
      for (const item of listed.items) {
        await trx
          .insertInto("handled_item")
          .values({ process_id: processId, item_id: item.id, outcome: "passed", run_id: run.id })
          .onConflict((oc) => oc.columns(["process_id", "item_id"]).doNothing())
          .execute();
      }
    }
  });
  lab.events.emit(runLife.runFinishedEvent(processId, run.id, outcome.status));
  await running(outcome.status === "passed" ? "passed" : "failed");

  if (outcome.status !== "passed") {
    await failLearn(
      lab,
      monsterRunId,
      processId,
      ensureStop(outcome.error ?? "The saved chain did not pass on the second example."),
    );
    return;
  }

  await lab.db.transaction().execute(async (trx) => {
    await monsterLife.verifyMonsterRun(trx, monsterRunId);
    await processLife.markAwaitingSeal(trx, processId, run.id);
  });
  lab.events.emit(monsterLife.monsterStatusEvent(processId, monsterRunId, "verified"));
  lab.events.emit(processLife.processStatusEvent(processId, "awaiting_seal"));
  lab.log.info({ kind: "process", id: processId, from: "learning", to: "awaiting_seal" }, "status");
}

/** What a monster may ask of the lab while it works. Each call is checked and recorded here. */
export function learnHooks(
  lab: Lab,
  input: { monsterRunId: string; processId: string; workspace: string; signal: AbortSignal },
): MonsterHooks {
  const { monsterRunId, processId, workspace, signal } = input;
  const fail = (error: unknown) => ({
    error: ensureStop(error instanceof Error ? error.message : "The lab refused this."),
  });
  return {
    async readShelf() {
      return [];
    },
    async recordAction(kind: ActionKind, text: string, toolName?: string) {
      const row = await lab.db
        .transaction()
        .execute((trx) => recordAction(lab, trx, { monsterRunId, kind, text, toolName }));
      lab.events.emit({ kind: "monster.action", processId, monsterRunId, action: actionView(row) });
    },
    async reportTokens(tokens) {
      await lab.db.transaction().execute((trx) => setTokens(trx, monsterRunId, tokens));
      lab.events.emit({
        kind: "monster.tokens",
        processId,
        monsterRunId,
        tokens: { ...tokens, total: tokens.input + tokens.output + tokens.cached },
      });
    },
    async createTool(draftFolder) {
      const sites = (
        await lab.db.selectFrom("process_site").select("site").where("process_id", "=", processId).execute()
      ).map((row) => row.site);
      const check = await lab.seams.shelf.check(draftFolder, sites, signal);
      if (!check.passed) {
        for (const site of check.uninvitedSites) {
          const row = await lab.db.transaction().execute((trx) =>
            recordRefusal(lab, trx, {
              site,
              stage: "install",
              processId,
              toolName: path.basename(draftFolder),
              monsterRunId,
            }),
          );
          lab.events.emit(refusalEvent(row));
        }
        return { error: ensureStop(check.error) };
      }
      try {
        await lab.db.transaction().execute((trx) =>
          installDraft(lab, trx, {
            processId,
            monsterRunId,
            name: check.name,
            description: check.description,
            sites: check.sites,
            kind: check.kind,
            draftFolder,
          }),
        );
      } catch (error) {
        return fail(error);
      }
      lab.events.emit({ kind: "tool.created", tool: check.name, processId, monsterRunId });
    },
    async takeTool(name) {
      try {
        await lab.db.transaction().execute((trx) => reuseTool(lab, trx, { processId, monsterRunId, name }));
      } catch (error) {
        return fail(error);
      }
      lab.events.emit({ kind: "tool.reused", tool: name, processId, monsterRunId });
    },
    async saveProcess(tools, check) {
      try {
        // The chain is read from the file the agent left, not from what it reported.
        const file = await readProcessFile(workspace);
        await lab.db
          .transaction()
          .execute((trx) => saveChain(lab, trx, { processId, monsterRunId, tools, check }));
        await saveChainFile(lab.config, processId, file);
      } catch (error) {
        return fail(error);
      }
    },
    async submitRepair() {
      return { error: "Only a repair may submit a new version of a tool." };
    },
  };
}

/** Adds one line of the lab's own checking and returns how to settle it. */
export async function verificationLine(lab: Lab, monsterRunId: string, processId: string, text: string) {
  const line = await lab.db.transaction().execute((trx) => addVerificationLine(trx, monsterRunId, text));
  const emit = (outcome: "pending" | "passed" | "failed") =>
    lab.events.emit({
      kind: "monster.verification",
      processId,
      monsterRunId,
      line: { id: line.id, at: iso(line.at), text: line.text, outcome },
    });
  emit("pending");
  return async (outcome: "passed" | "failed") => {
    await lab.db.transaction().execute((trx) => setVerificationOutcome(trx, line.id, outcome));
    emit(outcome);
  };
}

export async function currentSteps(lab: Lab, processId: string) {
  const steps = await lab.db
    .selectFrom("process_step")
    .innerJoin("tool", "tool.id", "process_step.tool_id")
    .select(["process_step.tool_id", "tool.current_version_id"])
    .where("process_step.process_id", "=", processId)
    .orderBy("process_step.position")
    .execute();
  return steps
    .filter((step) => step.current_version_id)
    .map((step) => ({ toolId: step.tool_id, toolVersionId: step.current_version_id! }));
}

async function failLearn(lab: Lab, monsterRunId: string, processId: string, reason: string) {
  const withdrawn = await withdrawCreatedTools(lab, monsterRunId);
  if (withdrawn.length > 0) {
    const settle = await verificationLine(
      lab,
      monsterRunId,
      processId,
      `No passing test run, so the tools this agent made were taken off the shelf again: ${withdrawn.join(", ")}.`,
    );
    await settle("failed");
  }
  await lab.db.transaction().execute(async (trx) => {
    await monsterLife.failMonsterRun(trx, monsterRunId, reason);
    await processLife.markFailedToLearn(trx, processId, reason);
  });
  lab.events.emit(monsterLife.monsterStatusEvent(processId, monsterRunId, "failed"));
  lab.events.emit(processLife.processStatusEvent(processId, "failed_to_learn"));
  lab.log.info({ kind: "process", id: processId, from: "learning", to: "failed_to_learn" }, "status");
}
