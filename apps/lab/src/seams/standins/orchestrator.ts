import type { OrchestratorSeam } from "../types.ts";

export const standinOrchestrator: OrchestratorSeam = {
  async propose() {
    return { proposals: [] };
  },
};
