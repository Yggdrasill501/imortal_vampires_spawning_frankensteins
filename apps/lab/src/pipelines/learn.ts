import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Lab } from "../app.ts";
import { agentEnvironment } from "../config.ts";
import { ensureStop } from "../errors.ts";
import * as monsterLife from "../lifecycle/monster-run.ts";
import * as processLife from "../lifecycle/process.ts";
import { addVerificationLine, setVerificationOutcome } from "../store/monster-log.ts";
import { iso } from "../time.ts";

export async function learnPipeline(lab: Lab, monsterRunId: string, signal: AbortSignal): Promise<void> {
  const monster = await lab.db
    .selectFrom("monster_run")
    .selectAll()
    .where("id", "=", monsterRunId)
    .executeTakeFirst();
  if (!monster) return;
  const workspace = path.join(lab.config.dataDir, "workspaces", monsterRunId);
  await mkdir(workspace, { recursive: true });

  lab.log.info({ seam: "monster", record: monsterRunId }, "seam start");
  const started = Date.now();
  let result;
  try {
    result = await lab.seams.monster.work({
      monsterRunId,
      processId: monster.process_id,
      kind: "learn",
      workspace,
      model: monster.model,
      agentEnvironment: agentEnvironment(lab.config),
      hooks: emptyHooks(),
      signal,
    });
  } catch {
    result = { outcome: "gave_up" as const, error: "The lab failed while doing this." };
  }
  lab.log.info(
    { seam: "monster", record: monsterRunId, duration: Date.now() - started, outcome: result.outcome },
    "seam end",
  );

  const chain = await lab.db
    .selectFrom("process_step")
    .select("position")
    .where("process_id", "=", monster.process_id)
    .executeTakeFirst();
  const gaveUp = result.outcome === "gave_up" || !chain;
  const reason =
    result.outcome === "gave_up" ? ensureStop(result.error) : "The agent did not save a process.";

  if (gaveUp) {
    await failLearn(lab, monsterRunId, monster.process_id, reason);
    return;
  }

  const line = await lab.db.transaction().execute(async (trx) =>
    addVerificationLine(trx, monsterRunId, "Install check of the saved tools."),
  );
  lab.events.emit({
    kind: "monster.verification",
    processId: monster.process_id,
    monsterRunId,
    line: { id: line.id, at: iso(line.at), text: line.text, outcome: "pending" },
  });
  const check = await lab.seams.shelf.check(workspace, [], signal);
  await lab.db.transaction().execute(async (trx) => {
    await setVerificationOutcome(trx, line.id, check.passed ? "passed" : "failed");
  });
  lab.events.emit({
    kind: "monster.verification",
    processId: monster.process_id,
    monsterRunId,
    line: {
      id: line.id,
      at: iso(line.at),
      text: line.text,
      outcome: check.passed ? "passed" : "failed",
    },
  });
  if (!check.passed) {
    await failLearn(lab, monsterRunId, monster.process_id, ensureStop(check.error));
    return;
  }

  const listed = await lab.seams.runner.listItems({ processId: monster.process_id, signal });
  if ("error" in listed) {
    await failLearn(lab, monsterRunId, monster.process_id, ensureStop(listed.error));
    return;
  }
  await failLearn(
    lab,
    monsterRunId,
    monster.process_id,
    "There was no second example to check the work on.",
  );
}

async function failLearn(lab: Lab, monsterRunId: string, processId: string, reason: string) {
  await lab.db.transaction().execute(async (trx) => {
    await monsterLife.failMonsterRun(trx, monsterRunId, reason);
    await processLife.markFailedToLearn(trx, processId, reason);
  });
  lab.events.emit(monsterLife.monsterStatusEvent(processId, monsterRunId, "failed"));
  lab.events.emit(processLife.processStatusEvent(processId, "failed_to_learn"));
  lab.log.info({ kind: "process", id: processId, from: "learning", to: "failed_to_learn" }, "status");
}

function emptyHooks() {
  return {
    async readShelf() {
      return [];
    },
    async recordAction() {},
    async reportTokens() {},
    async createTool() {
      return { error: "The install check is not built yet." };
    },
    async takeTool() {
      return { error: "The install check is not built yet." };
    },
    async saveProcess() {
      return { error: "The agent that learns and repairs is not built yet." };
    },
    async submitRepair() {
      return { error: "The agent that learns and repairs is not built yet." };
    },
  };
}
