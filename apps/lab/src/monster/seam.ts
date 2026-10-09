import type { MonsterSeam } from "../seams/types.ts";
import { learn, repair, type MonsterOptions } from "./monster.ts";
import type { MonsterBrief } from "./types.ts";

/**
 * What the seam is not handed today, and a monster cannot work without: the
 * process's name, description, success criterion, sites and logins, its
 * example items, and for a repair the failed step, its input, error and the
 * tool's code. Until `MonsterSeam.work` carries them, the service supplies
 * them here.
 */
export interface MonsterSeamDeps {
  shelfDir: string;
  timeoutMs?: number;
  headless?: boolean;
  briefFor(input: {
    monsterRunId: string;
    processId: string;
    kind: "learn" | "repair";
  }): Promise<MonsterBrief | { error: string }>;
}

/** Adapts a monster to the lab service's hooks. Exported, and deliberately not registered. */
export function createMonsterSeam(deps: MonsterSeamDeps): MonsterSeam {
  return {
    async work(input) {
      const brief = await deps.briefFor({
        monsterRunId: input.monsterRunId,
        processId: input.processId,
        kind: input.kind,
      });
      // A repair brief also has a field named `error` (the tool's failure), so the kind decides.
      if (!("kind" in brief)) return { outcome: "gave_up", error: brief.error };
      if (brief.kind !== input.kind) {
        return { outcome: "gave_up", error: "The brief does not match the kind of work." };
      }

      const options: MonsterOptions = {
        workspace: input.workspace,
        shelfDir: deps.shelfDir,
        model: input.model,
        env: input.agentEnvironment,
        headless: deps.headless,
        timeoutMs: deps.timeoutMs,
        signal: input.signal,
        onAction: async (action) => {
          await input.hooks.recordAction(action.kind, action.text, action.toolName);
        },
        onTokens: (tokens) => input.hooks.reportTokens(tokens),
      };

      if (brief.kind === "learn") {
        const outcome = await learn(brief, options);
        // Tools that pass the install check stay on the shelf even when the run fails.
        for (const tool of outcome.findings.created) {
          const failed = await input.hooks.createTool(tool.folder);
          if (failed) return { outcome: "gave_up", error: failed.error };
        }
        if (!outcome.ok || !outcome.findings.process) {
          return { outcome: "gave_up", error: outcome.error ?? "The agent did not finish." };
        }
        for (const name of outcome.findings.reused) {
          const failed = await input.hooks.takeTool(name);
          if (failed) return { outcome: "gave_up", error: failed.error };
        }
        const file = outcome.findings.process;
        const failed = await input.hooks.saveProcess(
          file.steps.map((step) => step.tool),
          { name: file.check_name, description: file.check_description },
        );
        if (failed) return { outcome: "gave_up", error: failed.error };
        return { outcome: "done" };
      }

      const outcome = await repair(brief, options);
      if (outcome.findings.outcome === "gave_up") {
        return { outcome: "gave_up", error: outcome.findings.reason };
      }
      if (outcome.findings.outcome === "failed") {
        return { outcome: "gave_up", error: outcome.error ?? "The agent did not finish." };
      }
      const failed = await input.hooks.submitRepair(outcome.findings.folder);
      if (failed) return { outcome: "gave_up", error: failed.error };
      return { outcome: "done", whatChanged: outcome.findings.whatChanged };
    },
  };
}
