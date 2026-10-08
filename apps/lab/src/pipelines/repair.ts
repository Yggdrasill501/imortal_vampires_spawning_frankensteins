import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Lab } from "../app.ts";
import { agentEnvironment } from "../config.ts";
import { ensureStop } from "../errors.ts";
import * as monsterLife from "../lifecycle/monster-run.ts";
import * as processLife from "../lifecycle/process.ts";

export async function repairPipeline(lab: Lab, monsterRunId: string, signal: AbortSignal): Promise<void> {
  const monster = await lab.db
    .selectFrom("monster_run")
    .selectAll()
    .where("id", "=", monsterRunId)
    .executeTakeFirst();
  if (!monster || !monster.failed_run_id) return;
  const workspace = path.join(lab.config.dataDir, "workspaces", monsterRunId);
  await mkdir(workspace, { recursive: true });

  let result;
  try {
    result = await lab.seams.monster.work({
      monsterRunId,
      processId: monster.process_id,
      kind: "repair",
      workspace,
      model: monster.model,
      agentEnvironment: agentEnvironment(lab.config),
      hooks: {
        async readShelf() {
          return [];
        },
        async recordAction() {},
        async reportTokens() {},
        async createTool() {
          return { error: "A repair may only submit a new version of the failing tool." };
        },
        async takeTool() {
          return { error: "A repair may only submit a new version of the failing tool." };
        },
        async saveProcess() {
          return { error: "A repair may only submit a new version of the failing tool." };
        },
        async submitRepair() {
          return { error: "The install check is not built yet." };
        },
      },
      signal,
    });
  } catch {
    result = { outcome: "gave_up" as const, error: "The lab failed while doing this." };
  }

  const reason = result.outcome === "gave_up" ? ensureStop(result.error) : "The agent produced no candidate.";
  const failedRun = await lab.db
    .selectFrom("run")
    .selectAll()
    .where("id", "=", monster.failed_run_id)
    .executeTakeFirst();
  const step = await lab.db
    .selectFrom("run_step")
    .selectAll()
    .where("run_id", "=", monster.failed_run_id)
    .where("position", "=", failedRun?.failed_step ?? 1)
    .executeTakeFirst();
  if (!failedRun || !step) return;

  let repairId: string | null = null;
  await lab.db.transaction().execute(async (trx) => {
    const repair = await trx
      .insertInto("repair")
      .values({
        tool_id: step.tool_id,
        process_id: monster.process_id,
        monster_run_id: monsterRunId,
        from_version_id: step.tool_version_id,
        failed_run_id: failedRun.id,
        item_label: failedRun.item_label,
        what_failed: failedRun.error ?? reason,
        what_changed: "",
        result: "not_fixed",
        reason,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    repairId = repair.id;
    await trx.updateTable("run").set({ repair_id: repair.id }).where("id", "=", failedRun.id).execute();
    await monsterLife.failMonsterRun(trx, monsterRunId, reason);
    await processLife.markNeedsHuman(
      trx,
      monster.process_id,
      { reason, causeRunId: failedRun.id },
      "repairing",
    );
  });
  if (repairId) {
    const tool = await lab.db.selectFrom("tool").select("name").where("id", "=", step.tool_id).executeTakeFirst();
    lab.events.emit({
      kind: "repair.recorded",
      repairId,
      tool: tool?.name ?? "tool",
      processId: monster.process_id,
    });
  }
  lab.events.emit(monsterLife.monsterStatusEvent(monster.process_id, monsterRunId, "failed"));
  lab.events.emit(processLife.processStatusEvent(monster.process_id, "needs_human"));
}
