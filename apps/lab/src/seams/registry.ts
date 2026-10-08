import { standinMonster } from "./standins/monster.ts";
import { standinOrchestrator } from "./standins/orchestrator.ts";
import { standinRunner } from "./standins/runner.ts";
import { standinScheduling } from "./standins/scheduling.ts";
import { standinShelf } from "./standins/shelf.ts";
import type { Seams } from "./types.ts";

export function createSeams(overrides: Partial<Seams> = {}): Seams {
  return {
    orchestrator: overrides.orchestrator ?? standinOrchestrator,
    monster: overrides.monster ?? standinMonster,
    shelf: overrides.shelf ?? standinShelf,
    runner: overrides.runner ?? standinRunner,
    scheduling: overrides.scheduling ?? standinScheduling,
  };
}
