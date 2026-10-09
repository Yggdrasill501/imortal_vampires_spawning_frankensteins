import type { FastifyInstance } from "fastify";
import {
  PATHS,
  SPEAKERS,
  type ListInterviewsResponse,
  type SaveInterviewRequest,
  type StartInterviewResponse,
} from "@repo/contract";
import { invalid, NOT_FOUND, stateChanged } from "../errors.ts";
import * as interviewLife from "../lifecycle/interview.ts";
import * as processLife from "../lifecycle/process.ts";
import { loginHeld, readLogins } from "../store/logins.ts";
import { interviewView } from "../views.ts";

export function interviewRoutes(app: FastifyInstance) {
  app.post(PATHS.interviews, async (request, reply) => {
    const body = request.body as SaveInterviewRequest;
    if (!body || !Array.isArray(body.transcript) || !body.language?.trim()) {
      throw invalid("The interview needs a language and a transcript.");
    }
    const hasUser = body.transcript.some(
      (turn) => turn && turn.speaker === "user" && typeof turn.text === "string" && turn.text.trim(),
    );
    const turnsOk = body.transcript.every(
      (turn) =>
        turn &&
        SPEAKERS.includes(turn.speaker) &&
        typeof turn.text === "string",
    );
    const started = Date.parse(body.startedAt);
    const ended = Date.parse(body.endedAt);
    if (!hasUser || !turnsOk || Number.isNaN(started) || Number.isNaN(ended)) {
      throw invalid("The interview needs a language and a transcript.");
    }
    if (body.continuedFrom) {
      const prior = await app.lab.db
        .selectFrom("interview")
        .select("id")
        .where("id", "=", body.continuedFrom)
        .executeTakeFirst();
      if (!prior) throw invalid("The interview this continues from does not exist.");
    }
    const row = await app.lab.db.transaction().execute((trx) =>
      interviewLife.createInterview(trx, {
        language: body.language.trim(),
        transcript: body.transcript,
        startedAt: new Date(started),
        endedAt: new Date(ended),
        continuedFromId: body.continuedFrom ?? null,
      }),
    );
    const view = await app.lab.db.transaction().execute((trx) => interviewView(app.lab, trx, row.id));
    app.lab.wakeDispatcher();
    return reply.code(201).send(view);
  });

  app.get(PATHS.interviews, async (): Promise<ListInterviewsResponse> => {
    const rows = await app.lab.db
      .selectFrom("interview")
      .select("id")
      .orderBy("started_at", "desc")
      .limit(100)
      .execute();
    const interviews = [];
    for (const row of rows) {
      const view = await app.lab.db.transaction().execute((trx) => interviewView(app.lab, trx, row.id));
      if (view) interviews.push(view);
    }
    return { interviews };
  });

  app.get("/interviews/:id", async (request) => {
    const { id } = request.params as { id: string };
    const view = await app.lab.db.transaction().execute((trx) => interviewView(app.lab, trx, id));
    if (!view) throw NOT_FOUND;
    return view;
  });

  app.post("/interviews/:id/start", async (request): Promise<StartInterviewResponse> => {
    const { id } = request.params as { id: string };
    const interview = await app.lab.db.selectFrom("interview").selectAll().where("id", "=", id).executeTakeFirst();
    if (!interview) throw NOT_FOUND;
    if (interview.status === "being_read") throw stateChanged("The transcript is still being read.");
    if (interview.invited_at) throw stateChanged("These processes were already started.");
    const proposed = await app.lab.db
      .selectFrom("process")
      .selectAll()
      .where("interview_id", "=", id)
      .where("status", "=", "proposed")
      .orderBy("position")
      .execute();
    if (interview.status === "nothing_found" || proposed.length === 0) {
      throw stateChanged("Nothing is left to start.");
    }
    const logins = await readLogins(app.lab.config);
    const invited = new Set(
      (await app.lab.db.selectFrom("invitation_site").select(["site", "login_needed"]).execute()).map(
        (row) => row.site,
      ),
    );
    const invitedRows = await app.lab.db.selectFrom("invitation_site").selectAll().execute();
    for (const process of proposed) {
      const sites = await app.lab.db
        .selectFrom("process_site")
        .selectAll()
        .where("process_id", "=", process.id)
        .execute();
      for (const site of sites) {
        if (!invited.has(site.site)) {
          throw invalid(`${process.name} needs ${site.site}, which is not in the invitation.`);
        }
        const invitedSite = invitedRows.find((row) => row.site === site.site);
        if ((invitedSite?.login_needed || site.login_needed) && !loginHeld(logins, site.site)) {
          throw invalid(`${site.site} needs a login.`);
        }
      }
    }

    await app.lab.db.transaction().execute(async (trx) => {
      if (!(await interviewLife.markInvited(trx, id))) {
        throw stateChanged("These processes were already started.");
      }
      for (const process of proposed) {
        const monster = await processLife.queueLearn(trx, process.id, app.lab.config.model, "proposed");
        if (!monster) throw stateChanged("This process is no longer proposed.");
        app.lab.events.emit(processLife.processStatusEvent(process.id, "queued"));
        app.lab.events.emit({
          kind: "monster.status",
          processId: process.id,
          monsterRunId: monster.id,
          status: "queued",
        });
      }
      app.lab.events.emit(interviewLife.interviewStatusEvent(id, "proposed"));
    });
    app.lab.wakeDispatcher();
    const view = await app.lab.db.transaction().execute((trx) => interviewView(app.lab, trx, id));
    return { interview: view! };
  });
}
