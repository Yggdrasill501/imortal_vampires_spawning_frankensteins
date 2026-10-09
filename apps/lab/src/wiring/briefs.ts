import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Fact } from "@repo/contract";
import type { Lab } from "../app.ts";
import type { MonsterBrief } from "../monster/types.ts";
import { readToolVersion } from "../shelf/validator.ts";
import { briefSitesOf, dataOf, readChainFile } from "./chain.ts";

/** Builds what a monster is told, from the lab's own records. */
export async function briefFor(
  lab: Lab,
  input: { monsterRunId: string; processId: string; kind: "learn" | "repair" },
): Promise<MonsterBrief | { error: string }> {
  const process = await lab.db
    .selectFrom("process")
    .selectAll()
    .where("id", "=", input.processId)
    .executeTakeFirst();
  if (!process) return { error: "The process no longer exists." };
  const { sites, connectors } = await briefSitesOf(lab, input.processId);

  if (input.kind === "learn") {
    return {
      kind: "learn",
      name: process.name,
      description: process.description,
      successCriterion: process.success_criterion,
      sites,
      connectors,
      examples: [],
    };
  }

  const monster = await lab.db
    .selectFrom("monster_run")
    .select("failed_run_id")
    .where("id", "=", input.monsterRunId)
    .executeTakeFirst();
  const run = monster?.failed_run_id
    ? await lab.db.selectFrom("run").selectAll().where("id", "=", monster.failed_run_id).executeTakeFirst()
    : undefined;
  const chain = await readChainFile(lab.config, input.processId);
  if (!run || !chain || !run.failed_step) return { error: "The failed run could not be found." };
  const step = await lab.db
    .selectFrom("run_step")
    .innerJoin("tool", "tool.id", "run_step.tool_id")
    .innerJoin("tool_version", "tool_version.id", "run_step.tool_version_id")
    .select(["tool.id as tool_id", "tool.name", "tool_version.code_path", "run_step.input", "run_step.error"])
    .where("run_step.run_id", "=", run.id)
    .where("run_step.position", "=", run.failed_step)
    .executeTakeFirst();
  const chainStep = chain.steps[run.failed_step - 1];
  if (!step || !chainStep) return { error: "The failed step could not be found." };

  const version = await readToolVersion(path.join(lab.config.shelfDir, step.code_path));
  const past = await lab.db
    .selectFrom("repair")
    .select(["what_changed", "result", "reason"])
    .where("tool_id", "=", step.tool_id)
    .orderBy("created_at")
    .execute();
  return {
    kind: "repair",
    tool: step.name,
    failedStep: chainStep.id,
    error: step.error ?? run.error ?? "The tool failed.",
    failingInput: dataOf(asFacts(step.input)),
    code: await readFile(version.codePath, "utf8"),
    meta: version.meta,
    examples: [],
    pastRepairs: past.map((row) =>
      row.result === "verified" ? row.what_changed : `Not fixed: ${row.reason ?? "no reason recorded"}`,
    ),
    sites,
    connectors,
    chain: { steps: chain.steps, check: chain.check },
    item: { id: run.item_id, label: run.item_label, data: dataOf(asFacts(run.item_fields)) },
  };
}

function asFacts(value: unknown): Fact[] {
  return Array.isArray(value) ? (value as Fact[]) : [];
}
