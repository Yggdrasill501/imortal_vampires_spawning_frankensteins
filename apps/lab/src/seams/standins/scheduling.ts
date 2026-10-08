import type { SchedulingSeam } from "../types.ts";

export const standinScheduling: SchedulingSeam = {
  async nextRunAt() {
    return null;
  },
};
