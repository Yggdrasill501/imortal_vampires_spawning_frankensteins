import type { FastifyInstance } from "fastify";
import {
  PATHS,
  SCHEDULE_MINUTES_MAX,
  SCHEDULE_MINUTES_MIN,
  type PutScheduleRequest,
} from "@repo/contract";
import { jsonb } from "@repo/db";
import { waitsFor } from "../eligibility.ts";
import { invalid, NOT_FOUND, stateChanged } from "../errors.ts";
import { jobKey } from "../app.ts";
import * as interviewLife from "../lifecycle/interview.ts";
import * as monsterLife from "../lifecycle/monster-run.ts";
import * as processLife from "../lifecycle/process.ts";
import * as tickLife from "../lifecycle/tick.ts";
import { interviewView, processDetail, processSummary, scheduleOf } from "../views.ts";

export function processRoutes(app: FastifyInstance) {
  app.get(PATHS.processes, async () => {
    const rows = await app.lab.db
      .selectFrom("process")
      .innerJoin("interview", "interview.id", "process.interview_id")
      .select("process.id")
      .orderBy("interview.created_at")
      .orderBy("process.position")
      .execute();
    const processes = [];
    for (const row of rows) {
      const summary = await app.lab.db.transaction().execute((trx) => processSummary(app.lab, trx, row.id));
      if (summary) processes.push(summary);
    }
    return { processes };
  });

  app.get("/processes/:id", async (request) => {
    const { id } = request.params as { id: string };
    const waiting = await waitsFor(app.lab.db, id, app.lab.config.maxMonsters);
    const view = await app.lab.db.transaction().execute((trx) => processDetail(app.lab, trx, id, waiting));
    if (!view) throw NOT_FOUND;
    return view;
  });

  app.delete("/processes/:id", async (request) => {
    const { id } = request.params as { id: string };
    const process = await app.lab.db.selectFrom("process").selectAll().where("id", "=", id).executeTakeFirst();
    if (!process) throw NOT_FOUND;
    if (process.status !== "proposed") throw stateChanged("This process is no longer a proposal.");
    await app.lab.db.transaction().execute(async (trx) => {
      await trx.deleteFrom("process").where("id", "=", id).execute();
    });
    const interview = await app.lab.db.transaction().execute((trx) =>
      interviewView(app.lab, trx, process.interview_id),
    );
    app.lab.events.emit(interviewLife.interviewStatusEvent(process.interview_id, interview?.status ?? "proposed"));
    return { removed: true as const };
  });

  app.post("/processes/:id/learn", async (request) => {
    const { id } = request.params as { id: string };
    const process = await requireProcess(app, id);
    if (process.status !== "failed_to_learn") throw stateChanged("This process is not waiting to learn again.");
    const monster = await app.lab.db.transaction().execute((trx) =>
      processLife.queueLearn(trx, id, app.lab.config.model, "failed_to_learn"),
    );
    if (!monster) throw stateChanged("This process is not waiting to learn again.");
    app.lab.events.emit(processLife.processStatusEvent(id, "queued"));
    app.lab.events.emit(monsterLife.monsterStatusEvent(id, monster.id, "queued"));
    app.lab.wakeDispatcher();
    return detail(app, id);
  });

  app.post("/processes/:id/seal", async (request) => {
    const { id } = request.params as { id: string };
    const process = await requireProcess(app, id);
    if (process.status !== "awaiting_seal") throw stateChanged("This process is not waiting for a seal.");
    const next = await app.lab.seams.scheduling.nextRunAt(scheduleOf(process), new Date(), app.lab.stop.signal);
    const ok = await app.lab.db.transaction().execute(async (trx) => {
      if (process.verification_run_id) {
        const steps = await trx
          .selectFrom("run_step")
          .selectAll()
          .where("run_id", "=", process.verification_run_id)
          .execute();
        for (const step of steps) {
          const version = await trx
            .selectFrom("tool_version")
            .select("examples")
            .where("id", "=", step.tool_version_id)
            .executeTakeFirst();
          const examples = Array.isArray(version?.examples) ? [...version.examples] : [];
          examples.push({ input: step.input, result: step.result });
          await trx
            .updateTable("tool_version")
            .set({ examples: jsonb(examples) })
            .where("id", "=", step.tool_version_id)
            .execute();
        }
      }
      return processLife.sealProcess(trx, id, next);
    });
    if (!ok) throw stateChanged("This process is not waiting for a seal.");
    app.lab.events.emit(processLife.processStatusEvent(id, "sealed"));
    return detail(app, id);
  });

  app.post("/processes/:id/run", async (request) => {
    const { id } = request.params as { id: string };
    const process = await requireProcess(app, id);
    if (process.status !== "sealed") throw stateChanged("This process is not sealed.");
    await app.lab.db.transaction().execute(async (trx) => {
      const live = await trx
        .selectFrom("tick")
        .select("id")
        .where("process_id", "=", id)
        .where("status", "in", ["queued", "running"])
        .executeTakeFirst();
      if (!live) await tickLife.queueTick(trx, id, "run_now");
    });
    app.lab.wakeDispatcher();
    return detail(app, id);
  });

  app.post("/processes/:id/resume", async (request) => {
    const { id } = request.params as { id: string };
    const process = await requireProcess(app, id);
    if (process.status !== "needs_human") throw stateChanged("This process does not need a person.");
    const next = await app.lab.seams.scheduling.nextRunAt(scheduleOf(process), new Date(), app.lab.stop.signal);
    const ok = await app.lab.db.transaction().execute((trx) => processLife.resumeProcess(trx, id, next));
    if (!ok) throw stateChanged("This process does not need a person.");
    app.lab.events.emit(processLife.processStatusEvent(id, "sealed"));
    return detail(app, id);
  });

  app.put("/processes/:id/schedule", async (request) => {
    const { id } = request.params as { id: string };
    const process = await requireProcess(app, id);
    if (process.status === "proposed" || process.status === "retired") {
      throw stateChanged("This process cannot change its schedule.");
    }
    const body = request.body as PutScheduleRequest;
    const schedule = body?.schedule;
    if (!schedule || (schedule.kind !== "daily" && schedule.kind !== "every")) {
      throw invalid("The schedule is not valid.");
    }
    if (schedule.kind === "daily" && !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(schedule.time)) {
      throw invalid("The schedule is not valid.");
    }
    if (
      schedule.kind === "every" &&
      (!Number.isInteger(schedule.minutes) ||
        schedule.minutes < SCHEDULE_MINUTES_MIN ||
        schedule.minutes > SCHEDULE_MINUTES_MAX)
    ) {
      throw invalid("The schedule is not valid.");
    }
    const next =
      process.status === "sealed"
        ? await app.lab.seams.scheduling.nextRunAt(schedule, new Date(), app.lab.stop.signal)
        : process.next_run_at;
    const ok = await app.lab.db.transaction().execute((trx) => processLife.setSchedule(trx, id, schedule, next));
    if (!ok) throw stateChanged("This process cannot change its schedule.");
    app.lab.events.emit(processLife.processStatusEvent(id, process.status as never));
    return detail(app, id);
  });

  app.post("/processes/:id/retire", async (request) => {
    const { id } = request.params as { id: string };
    const process = await requireProcess(app, id);
    if (process.status === "retired") throw stateChanged("This process is already retired.");
    await app.lab.db.transaction().execute((trx) => processLife.retireProcess(trx, id));
    const running = [...app.lab.jobs.keys()].find((key) => key === jobKey("monster", process.current_monster_run_id ?? ""));
    if (running) app.lab.jobs.get(running)?.abort();
    app.lab.events.emit(processLife.processStatusEvent(id, "retired"));
    return detail(app, id);
  });
}

async function requireProcess(app: FastifyInstance, id: string) {
  const process = await app.lab.db.selectFrom("process").selectAll().where("id", "=", id).executeTakeFirst();
  if (!process) throw NOT_FOUND;
  return process;
}

async function detail(app: FastifyInstance, id: string) {
  const waiting = await waitsFor(app.lab.db, id, app.lab.config.maxMonsters);
  return app.lab.db.transaction().execute((trx) => processDetail(app.lab, trx, id, waiting));
}
