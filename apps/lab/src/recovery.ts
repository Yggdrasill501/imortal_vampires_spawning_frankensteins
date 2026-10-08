import type { Lab } from "./app.ts";
import * as interviewLife from "./lifecycle/interview.ts";
import * as monsterLife from "./lifecycle/monster-run.ts";
import * as processLife from "./lifecycle/process.ts";
import * as runLife from "./lifecycle/run.ts";
import * as tickLife from "./lifecycle/tick.ts";

const RESTART = "The lab restarted while this was in progress.";
const RESTART_RUN = "The lab restarted during this run.";
const RESTART_HUMAN =
  "The lab restarted during a run, so check that item by hand.";

export async function recover(lab: Lab): Promise<void> {
  await lab.db.transaction().execute(async (trx) => {
    const interviews = await trx
      .selectFrom("interview")
      .selectAll()
      .where("status", "=", "being_read")
      .where("read_started_at", "is not", null)
      .where("read_error", "is", null)
      .execute();
    for (const interview of interviews) {
      await interviewLife.clearReadStart(trx, interview.id);
    }

    const monsters = await trx
      .selectFrom("monster_run")
      .selectAll()
      .where("status", "=", "running")
      .execute();
    for (const monster of monsters) {
      await monsterLife.failMonsterRun(trx, monster.id, RESTART);
      if (monster.kind === "learn") {
        await processLife.markFailedToLearn(trx, monster.process_id, RESTART);
      } else if (monster.failed_run_id) {
        await processLife.markNeedsHuman(
          trx,
          monster.process_id,
          { reason: RESTART, causeRunId: monster.failed_run_id },
          ["repairing", "sealed"],
        );
      }
    }

    const runs = await trx.selectFrom("run").selectAll().where("status", "=", "running").execute();
    for (const run of runs) {
      await runLife.finishRun(trx, run.id, "failed", {
        error: RESTART_RUN,
        modelCalls: run.model_calls,
        startedAt: run.started_at ? new Date(run.started_at) : new Date(),
      });
      if (run.kind === "scheduled" || run.kind === "run_now") {
        await processLife.markNeedsHuman(
          trx,
          run.process_id,
          { reason: RESTART_HUMAN, causeRunId: run.id },
          ["sealed", "repairing"],
        );
      }
    }

    const ticks = await trx.selectFrom("tick").selectAll().where("status", "=", "running").execute();
    for (const tick of ticks) {
      const created = await trx
        .selectFrom("run")
        .select((eb) => eb.fn.countAll().as("count"))
        .where("tick_id", "=", tick.id)
        .executeTakeFirst();
      const count = Number(created?.count ?? 0);
      if (count > 0) await tickLife.finishTick(trx, tick.id, count);
      else await tickLife.requeueTick(trx, tick.id);
    }
  });
}
