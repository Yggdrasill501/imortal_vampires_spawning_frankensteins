import { standinMonster } from "./standins/monster.ts";
import { standinOrchestrator } from "./standins/orchestrator.ts";
import { standinRunner } from "./standins/runner.ts";
import { standinScheduling } from "./standins/scheduling.ts";
import { standinShelf } from "./standins/shelf.ts";
import { agentEnvironment, type Config } from "../config.ts";
import { askCursorAgent } from "../orchestrator/ask.ts";
import { createOrchestrator, parseKnownSystems } from "../orchestrator/index.ts";
import type { Seams } from "./types.ts";

/** The parts that are built. Tests leave these out and get the stand-ins. */
export function productionSeams(config: Config): Partial<Seams> {
  return {
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
