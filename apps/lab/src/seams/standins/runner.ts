import type { RunnerSeam } from "../types.ts";

const NOT_BUILT = "The runner is not built yet.";

export const standinRunner: RunnerSeam = {
  async listItems() {
    return { error: NOT_BUILT };
  },
  async runItem() {
    return {
      status: "failed",
      proofValue: null,
      failedStep: 1,
      error: NOT_BUILT,
      modelCalls: 0,
    };
  },
  async replay() {
    return { error: NOT_BUILT };
  },
};
