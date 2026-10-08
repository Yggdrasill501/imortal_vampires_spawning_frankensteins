import type { MonsterSeam } from "../types.ts";

export const standinMonster: MonsterSeam = {
  async work() {
    return { outcome: "gave_up", error: "The agent that learns and repairs is not built yet." };
  },
};
