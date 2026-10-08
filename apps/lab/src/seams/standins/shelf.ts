import type { ShelfSeam } from "../types.ts";

export const standinShelf: ShelfSeam = {
  async check() {
    return { passed: false, error: "The install check is not built yet.", uninvitedSites: [] };
  },
};
