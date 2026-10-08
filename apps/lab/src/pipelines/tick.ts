import type { Lab } from "../app.ts";
import * as runLife from "../lifecycle/run.ts";
import * as tickLife from "../lifecycle/tick.ts";
import { ensureStop } from "../errors.ts";

export async function tickPipeline(lab: Lab, tickId: string, signal: AbortSignal): Promise<void> {
  const tick = await lab.db.selectFrom("tick").selectAll().where("id", "=", tickId).executeTakeFirst();
  if (!tick) return;
  const process = await lab.db
    .selectFrom("process")
    .selectAll()
    .where("id", "=", tick.process_id)
    .executeTakeFirst();
  if (!process || process.status !== "sealed") {
    await lab.db.transaction().execute(async (trx) => {
      await tickLife.finishTick(trx, tickId, 0);
    });
    lab.events.emit(tickLife.tickFinishedEvent(tick.process_id, tickId, 0));
    return;
  }

  const listed = await lab.seams.runner.listItems({ processId: process.id, signal });
  if ("error" in listed) {
    const steps = await currentSteps(lab, process.id);
    await lab.db.transaction().execute(async (trx) => {
      await runLife.createRun(trx, {
        processId: process.id,
        kind: tick.kind === "scheduled" ? "scheduled" : "run_now",
        itemId: `lookup:${tickId}`,
        itemLabel: "Looking for new work",
        itemFields: [],
        tickId,
        steps,
      });
      const created = await trx
        .selectFrom("run")
        .select("id")
        .where("item_id", "=", `lookup:${tickId}`)
        .executeTakeFirstOrThrow();
      await trx
        .updateTable("run")
        .set({
          status: "failed",
          error: ensureStop(listed.error),
          failed_step: 1,
          finished_at: new Date(),
          duration_ms: 0,
        })
        .where("id", "=", created.id)
        .execute();
      await tickLife.finishTick(trx, tickId, 1);
    });
    lab.events.emit(tickLife.tickFinishedEvent(process.id, tickId, 1));
    return;
  }

  const handled = await lab.db
    .selectFrom("handled_item")
    .select("item_id")
    .where("process_id", "=", process.id)
    .execute();
  const live = await lab.db
    .selectFrom("run")
    .select("item_id")
    .where("process_id", "=", process.id)
    .where("status", "in", ["pending", "running"])
    .execute();
  const skip = new Set([...handled, ...live].map((row) => row.item_id));
  const fresh = listed.items.filter((item) => !skip.has(item.id));
  const steps = await currentSteps(lab, process.id);
  await lab.db.transaction().execute(async (trx) => {
    for (const item of fresh) {
      await runLife.createRun(trx, {
        processId: process.id,
        kind: tick.kind === "scheduled" ? "scheduled" : "run_now",
        itemId: item.id,
        itemLabel: item.label,
        itemFields: item.fields,
        tickId,
        steps,
      });
    }
    await tickLife.finishTick(trx, tickId, fresh.length);
  });
  lab.events.emit(tickLife.tickFinishedEvent(process.id, tickId, fresh.length));
}

async function currentSteps(lab: Lab, processId: string) {
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
