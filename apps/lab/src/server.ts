import cors from "@fastify/cors";
import type { ApiError } from "@repo/contract";
import Fastify, { type FastifyInstance } from "fastify";
import type { Lab } from "./app.ts";
import { DATABASE_UNREACHABLE, INTERNAL, LabHttpError } from "./errors.ts";
import { eventRoutes } from "./routes/events.ts";
import { healthRoutes } from "./routes/health.ts";
import { interviewRoutes } from "./routes/interviews.ts";
import { invitationRoutes } from "./routes/invitation.ts";
import { monsterRunRoutes } from "./routes/monster-runs.ts";
import { processRoutes } from "./routes/processes.ts";
import { runRoutes } from "./routes/runs.ts";
import { toolRoutes } from "./routes/tools.ts";

declare module "fastify" {
  interface FastifyInstance {
    lab: Lab;
  }
}

export async function buildServer(lab: Lab): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: lab.config.logLevel,
    },
  });
  app.decorate("lab", lab);
  lab.log = app.log;

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, lab.config.webOrigins.includes(origin));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["content-type", "last-event-id"],
    credentials: false,
  });

  app.addHook("onRequest", async (request, reply) => {
    const url = request.url.split("?")[0] ?? "";
    if (url === "/health" || url === "/events") return;
    if (!lab.dbReady) {
      await reply.status(500).send({
        error: DATABASE_UNREACHABLE.message,
        code: DATABASE_UNREACHABLE.code,
      } satisfies ApiError);
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof LabHttpError) {
      if (error.code === "invalid" || error.code === "state_changed") {
        request.log.info({ path: request.url, code: error.code }, "refused");
      }
      void reply.status(error.status).send({ error: error.message, code: error.code } satisfies ApiError);
      return;
    }
    const err = error as { statusCode?: number; code?: string; validation?: unknown };
    if (err.validation || err.statusCode === 400 || err.code === "FST_ERR_CTP_INVALID_JSON_BODY") {
      void reply.status(400).send({ error: "The request is not valid.", code: "invalid" } satisfies ApiError);
      return;
    }
    request.log.error({ err: error }, "unexpected");
    void reply.status(500).send({ error: INTERNAL.message, code: INTERNAL.code } satisfies ApiError);
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.status(404).send({
      error: "Nothing by that name exists in the lab.",
      code: "not_found",
    } satisfies ApiError);
  });

  healthRoutes(app);
  eventRoutes(app);
  interviewRoutes(app);
  invitationRoutes(app);
  processRoutes(app);
  toolRoutes(app);
  runRoutes(app);
  monsterRunRoutes(app);
  return app;
}
