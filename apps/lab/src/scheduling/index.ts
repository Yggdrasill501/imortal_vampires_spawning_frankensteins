import type { SchedulingSeam } from "../seams/types.ts";
import { nextRun } from "./next-run.ts";

export { nextRun } from "./next-run.ts";

export const scheduling: SchedulingSeam = {
  async nextRunAt(schedule, after) {
    return nextRun(schedule, after);
  },
};
