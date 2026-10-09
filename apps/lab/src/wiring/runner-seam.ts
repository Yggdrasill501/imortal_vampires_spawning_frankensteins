import type { Lab } from "../app.ts";
import { Runner } from "../runner/runner.ts";
import type { RunnerSeam, ShelfSeam } from "../seams/types.ts";
import { checkToolVersion } from "../shelf/validator.ts";
import { recordRefusal, refusalEvent } from "../store/gate.ts";
import { readLogins } from "../store/logins.ts";
import { factsOf, itemOf, readChainFile, scopeOf } from "./chain.ts";

const NO_CHAIN = "This process has no saved chain.";

/** The model-free runner, given the process's chain, access and logins by the lab. */
export function createRunnerSeam(getLab: () => Lab): RunnerSeam {
  const runnerOf = (lab: Lab) =>
    new Runner({ shelfDir: lab.config.shelfDir, runTimeoutMs: lab.config.runTimeoutMs });

  return {
    async listItems({ processId }) {
      const lab = getLab();
      const chain = await readChainFile(lab.config, processId);
      if (!chain) return { error: NO_CHAIN };
      const listed = await runnerOf(lab).listItems(chain, await scopeOf(lab, processId));
      if (listed.status !== "passed") {
        return { error: listed.error ?? "The tool that lists the incoming work failed." };
      }
      return {
        items: listed.items.map((item) => ({ id: item.id, label: item.label, fields: factsOf(item.data) })),
      };
    },

    async runItem({ runId, processId, item, hooks }) {
      const lab = getLab();
      const chain = await readChainFile(lab.config, processId);
      if (!chain) {
        return { status: "failed", proofValue: null, failedStep: 1, error: NO_CHAIN, modelCalls: 0 };
      }
      const result = await runnerOf(lab).runItem(chain, itemOf(item), await scopeOf(lab, processId));

      // The first step listed this item, so it has already passed.
      await hooks.stepStarted(1, []);
      await hooks.stepEnded({ position: 1, status: "passed", result: item.fields });
      for (const [index, step] of result.steps.entries()) {
        const position = index + 2;
        await hooks.stepStarted(position, factsOf(step.input));
        await hooks.stepEnded({
          position,
          status: step.status,
          result: factsOf(step.result),
          ...(step.error ? { error: step.error } : {}),
        });
      }
      for (const refusal of result.refusals) {
        const row = await lab.db.transaction().execute((trx) =>
          recordRefusal(lab, trx, {
            site: refusal.site,
            stage: "run",
            processId,
            toolName: refusal.tool,
            toolVersion: refusal.version,
            runId,
          }),
        );
        lab.events.emit(refusalEvent(row));
      }
      return {
        status: result.status,
        proofValue: result.proofValue,
        failedStep: result.failedStep === null ? null : result.failedStep + 1,
        error: result.error,
        modelCalls: result.modelCalls,
      };
    },

    async replay() {
      return { error: "Replaying one tool by itself is not part of this version." };
    },
  };
}

export function createShelfSeam(getLab: () => Lab): ShelfSeam {
  return {
    async check(folder, invitedSites) {
      const lab = getLab();
      const rows = await lab.db.selectFrom("invitation_site").select(["site", "kind"]).execute();
      const allowed = new Set(invitedSites);
      const invited = invitedSites.length === 0 ? rows : rows.filter((row) => allowed.has(row.site));
      const passwords = Object.values(await readLogins(lab.config)).map((login) => login.password);
      const check = await checkToolVersion(
        folder,
        {
          sites: invited.filter((row) => row.kind === "website").map((row) => row.site),
          connectors: invited.filter((row) => row.kind === "connector").map((row) => row.site),
        },
        passwords,
      );
      if (!check.passed || !check.tool) {
        return {
          passed: false,
          error: check.issues.map((issue) => issue.message).join(" "),
          uninvitedSites: check.issues.flatMap((issue) => issue.site ?? issue.connector ?? []),
        };
      }
      const { meta } = check.tool;
      return {
        passed: true,
        name: meta.name,
        description: meta.description,
        sites: [...meta.sites, ...meta.connectors],
        kind: meta.effect,
      };
    },
  };
}
