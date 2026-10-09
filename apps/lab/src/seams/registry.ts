import { standinMonster } from "./standins/monster.ts";
import { standinOrchestrator } from "./standins/orchestrator.ts";
import { standinRunner } from "./standins/runner.ts";
import { standinScheduling } from "./standins/scheduling.ts";
import { standinShelf } from "./standins/shelf.ts";
import type { Lab } from "../app.ts";
import { agentEnvironment, type Config } from "../config.ts";
import { createMonsterSeam } from "../monster/seam.ts";
import { askCursorAgent } from "../orchestrator/ask.ts";
import { createOrchestrator, parseKnownSystems } from "../orchestrator/index.ts";
import { scheduling } from "../scheduling/index.ts";
import { briefFor } from "../wiring/briefs.ts";
import { createRunnerSeam, createShelfSeam } from "../wiring/runner-seam.ts";
import type { Seams } from "./types.ts";

/** The parts that are built. Tests leave these out and get the stand-ins. */
export function productionSeams(config: Config, getLab: () => Lab): Partial<Seams> {
  return {
    monster: createMonsterSeam({
      shelfDir: config.shelfDir,
      timeoutMs: config.monsterTimeoutMs,
      briefFor: (input) => briefFor(getLab(), input),
    }),
    shelf: createShelfSeam(getLab),
    runner: createRunnerSeam(getLab),
    scheduling,
    orchestrator: createOrchestrator({
      ask: askCursorAgent,
      knownSystems: () => parseKnownSystems(process.env.LAB_KNOWN_SYSTEMS),
      env: () => agentEnvironment(config),
    }),
  };
}

export function createSeams(overrides: Partial<Seams> = {}): Seams {
  return {
    orchestrator: overrides.orchestrator ?? standinOrchestrator,
    monster: overrides.monster ?? standinMonster,
    shelf: overrides.shelf ?? standinShelf,
    runner: overrides.runner ?? standinRunner,
    scheduling: overrides.scheduling ?? standinScheduling,
  };
}
