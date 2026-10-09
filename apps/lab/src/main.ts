import { createDatabase } from "@repo/db";
import type { Lab } from "./app.ts";
import { ensureLabDirs, loadConfig, type Config } from "./config.ts";
import { startDispatcher } from "./dispatcher.ts";
import { EventBus } from "./events.ts";
import { recover } from "./recovery.ts";
import { createSeams, productionSeams } from "./seams/registry.ts";
import type { Seams } from "./seams/types.ts";
import { buildServer } from "./server.ts";

export async function createLab(options: {
  config?: Partial<Config>;
  seams?: Partial<Seams>;
  /** Use the built parts where they exist. Off by default, so tests get the stand-ins. */
  production?: boolean;
} = {}): Promise<Lab> {
  const config = loadConfig(options.config);
  await ensureLabDirs(config);
  const db = createDatabase(config.databaseUrl);
  return {
    config,
    db,
    events: new EventBus(),
    seams: createSeams({
      ...(options.production ? productionSeams(config) : {}),
      ...options.seams,
    }),
    dbReady: false,
    stop: new AbortController(),
    jobs: new Map(),
    wakeDispatcher: () => {},
    stopDispatcher: () => {},
    log: {
      info: () => {},
      debug: () => {},
      error: (obj, msg) => {
        if (process.env.LAB_LOG_LEVEL === "debug") console.error(msg, obj);
      },
    },
  };
}

export async function startLab(options: {
  config?: Partial<Config>;
  seams?: Partial<Seams>;
  recoverOnStart?: boolean;
} = {}) {
  const lab = await createLab({ production: true, ...options });
  const server = await buildServer(lab);
  const address = await server.listen({ host: lab.config.host, port: lab.config.port });

  void waitForDatabase(lab).then(async () => {
    lab.dbReady = true;
    if (options.recoverOnStart !== false) await recover(lab);
    startDispatcher(lab);
  });

  return { lab, server, address };
}

export async function waitForDatabase(lab: Lab): Promise<void> {
  while (!lab.stop.signal.aborted) {
    try {
      await lab.db.selectFrom("interview").select("id").limit(1).execute();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

export async function shutdownLab(lab: Lab, server: { close: () => Promise<void> }): Promise<void> {
  lab.stop.abort();
  lab.stopDispatcher();
  for (const job of lab.jobs.values()) job.abort();
  await Promise.race([
    new Promise((resolve) => setTimeout(resolve, 50)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  await server.close();
  await lab.db.destroy();
}

const isEntry = process.argv[1]?.includes("main.ts") || process.argv[1]?.includes("main.js");
if (isEntry) {
  startLab()
    .then(({ lab, server }) => {
      const stop = () => {
        void shutdownLab(lab, server).then(() => process.exit(0));
      };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    });
}
