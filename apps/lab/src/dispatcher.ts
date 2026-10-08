import type { Lab } from "./app.ts";
import { jobKey } from "./app.ts";
import { canClaimMonster, canClaimRun } from "./eligibility.ts";
import * as interviewLife from "./lifecycle/interview.ts";
import * as monsterLife from "./lifecycle/monster-run.ts";
import * as processLife from "./lifecycle/process.ts";
import * as runLife from "./lifecycle/run.ts";
import * as tickLife from "./lifecycle/tick.ts";
import { learnPipeline } from "./pipelines/learn.ts";
import { readPipeline } from "./pipelines/read.ts";
import { repairPipeline } from "./pipelines/repair.ts";
import { runPipeline } from "./pipelines/run.ts";
import { tickPipeline } from "./pipelines/tick.ts";
import { scheduleOf } from "./views.ts";

export function startDispatcher(lab: Lab): () => void {
  let running = false;
  let again = false;
  const wake = () => {
    if (lab.stop.signal.aborted) return;
    if (running) {
      again = true;
      return;
    }
    void pass();
  };
  lab.wakeDispatcher = wake;
  const timer = setInterval(wake, lab.config.dispatchIntervalMs);
  lab.stopDispatcher = () => clearInterval(timer);

  async function pass() {
    running = true;
    try {
      do {
        again = false;
        if (!lab.dbReady || lab.stop.signal.aborted) return;
        await createDueTicks(lab);
        await claimInterviews(lab);
        await claimMonsters(lab);
        await claimTicks(lab);
        await claimRuns(lab);
      } while (again && !lab.stop.signal.aborted);
    } catch (error) {
      lab.log.error({ err: error }, "dispatcher");
    } finally {
      running = false;
    }
  }

  wake();
  return () => clearInterval(timer);
}

async function createDueTicks(lab: Lab) {
  const due = await lab.db
    .selectFrom("process")
    .selectAll()
    .where("status", "=", "sealed")
    .where("next_run_at", "is not", null)
    .where("next_run_at", "<=", new Date())
    .execute();
  for (const process of due) {
    await lab.db.transaction().execute(async (trx) => {
      const live = await trx
        .selectFrom("tick")
        .select("id")
        .where("process_id", "=", process.id)
        .where("status", "in", ["queued", "running"])
        .executeTakeFirst();
      if (live) return;
      await tickLife.queueTick(trx, process.id, "scheduled");
      const next = await lab.seams.scheduling.nextRunAt(
        scheduleOf(process),
        new Date(),
        lab.stop.signal,
      );
      await processLife.setNextRunAt(trx, process.id, next);
    });
  }
}

async function claimInterviews(lab: Lab) {
  const reading = await lab.db
    .selectFrom("interview")
    .select("id")
    .where("status", "=", "being_read")
    .where("read_started_at", "is not", null)
    .where("read_error", "is", null)
    .executeTakeFirst();
  if (reading) return;
  const candidates = await lab.db
    .selectFrom("interview")
    .select("id")
    .where("status", "=", "being_read")
    .where("read_started_at", "is", null)
    .where("read_error", "is", null)
    .orderBy("created_at")
    .execute();
  for (const candidate of candidates) {
    const claimed = await lab.db.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom("interview")
        .selectAll()
        .where("id", "=", candidate.id)
        .forUpdate()
        .skipLocked()
        .executeTakeFirst();
      if (!row || row.read_started_at || row.read_error || row.status !== "being_read") return false;
      return interviewLife.markReadStarted(trx, row.id);
    });
    if (claimed) {
      startJob(lab, "interview", candidate.id, lab.config.readTimeoutMs, (signal) =>
        readPipeline(lab, candidate.id, signal),
      );
      return;
    }
  }
}

async function claimMonsters(lab: Lab) {
  const queued = await lab.db
    .selectFrom("monster_run")
    .selectAll()
    .where("status", "=", "queued")
    .orderBy("created_at")
    .execute();
  for (const monster of queued) {
    if (!(await canClaimMonster(lab.db, monster.id, lab.config.maxMonsters))) continue;
    const claimed = await lab.db.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom("monster_run")
        .selectAll()
        .where("id", "=", monster.id)
        .forUpdate()
        .skipLocked()
        .executeTakeFirst();
      if (!row || row.status !== "queued") return false;
      if (!(await canClaimMonster(trx, row.id, lab.config.maxMonsters))) return false;
      if (!(await monsterLife.claimMonsterRun(trx, row.id))) return false;
      await processLife.markLearning(trx, row.process_id).catch(() => false);
      if (row.kind === "repair") {
        await trx
          .updateTable("process")
          .set({ status: "repairing" })
          .where("id", "=", row.process_id)
          .where("status", "in", ["repairing", "sealed"])
          .execute();
      }
      return true;
    });
    if (!claimed) continue;
    lab.events.emit(monsterLife.monsterStatusEvent(monster.process_id, monster.id, "running"));
    if (monster.kind === "learn") {
      lab.events.emit(processLife.processStatusEvent(monster.process_id, "learning"));
    }
    startJob(lab, "monster", monster.id, lab.config.monsterTimeoutMs, (signal) =>
      monster.kind === "repair" ? repairPipeline(lab, monster.id, signal) : learnPipeline(lab, monster.id, signal),
    );
  }
}

async function claimTicks(lab: Lab) {
  const queued = await lab.db
    .selectFrom("tick")
    .selectAll()
    .where("status", "=", "queued")
    .orderBy("created_at")
    .execute();
  for (const tick of queued) {
    const claimed = await lab.db.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom("tick")
        .selectAll()
        .where("id", "=", tick.id)
        .forUpdate()
        .skipLocked()
        .executeTakeFirst();
      if (!row || row.status !== "queued") return false;
      return tickLife.claimTick(trx, row.id);
    });
    if (claimed) {
      startJob(lab, "tick", tick.id, lab.config.runTimeoutMs, (signal) => tickPipeline(lab, tick.id, signal));
    }
  }
}

async function claimRuns(lab: Lab) {
  const pending = await lab.db
    .selectFrom("run")
    .selectAll()
    .where("status", "=", "pending")
    .orderBy("kind")
    .orderBy("created_at")
    .execute();
  const ordered = [
    ...pending.filter((row) => row.kind === "verification" || row.kind === "after_repair"),
    ...pending.filter((row) => row.kind !== "verification" && row.kind !== "after_repair"),
  ];
  for (const run of ordered) {
    if (!(await canClaimRun(lab.db, run.id, lab.config.maxRuns))) continue;
    const claimed = await lab.db.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom("run")
        .selectAll()
        .where("id", "=", run.id)
        .forUpdate()
        .skipLocked()
        .executeTakeFirst();
      if (!row || row.status !== "pending") return false;
      if (!(await canClaimRun(trx, row.id, lab.config.maxRuns))) return false;
      return runLife.claimRun(trx, row.id);
    });
    if (!claimed) continue;
    lab.events.emit(runLife.runStartedEvent(run.process_id, run.id));
    startJob(lab, "run", run.id, lab.config.runTimeoutMs, (signal) => runPipeline(lab, run.id, signal));
  }
}

function startJob(
  lab: Lab,
  kind: string,
  id: string,
  timeoutMs: number,
  work: (signal: AbortSignal) => Promise<void>,
) {
  const controller = new AbortController();
  lab.jobs.set(jobKey(kind, id), controller);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  lab.log.debug({ kind, id }, "claim");
  void work(controller.signal)
    .catch((error) => lab.log.error({ err: error, kind, id }, "pipeline"))
    .finally(() => {
      clearTimeout(timer);
      lab.jobs.delete(jobKey(kind, id));
      lab.wakeDispatcher();
    });
}
