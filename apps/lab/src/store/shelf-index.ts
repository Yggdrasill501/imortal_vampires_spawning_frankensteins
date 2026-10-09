import { cp, rm } from "node:fs/promises";
import path from "node:path";
import type { Fact, ToolKind, ToolOrigin } from "@repo/contract";
import { jsonb } from "@repo/db";
import type { Lab, Trx } from "../app.ts";
import { invalid } from "../errors.ts";
import { recordAction } from "./monster-log.ts";

export async function installDraft(
  lab: Lab,
  trx: Trx,
  input: {
    processId: string;
    monsterRunId: string;
    name: string;
    description: string;
    sites: string[];
    kind: ToolKind;
    draftFolder: string;
  },
) {
  const processSites = await trx
    .selectFrom("process_site")
    .select("site")
    .where("process_id", "=", input.processId)
    .execute();
  const allowed = new Set(processSites.map((row) => row.site));
  const invited = new Set(
    (await trx.selectFrom("invitation_site").select("site").execute()).map((row) => row.site),
  );
  for (const site of input.sites) {
    if (!allowed.has(site) || !invited.has(site)) {
      throw invalid(`The tool names a site this process may not use: ${site}.`);
    }
  }
  const existing = await trx.selectFrom("tool").selectAll().where("name", "=", input.name).executeTakeFirst();
  if (existing?.current_version_id) throw invalid(`The name ${input.name} is already on the shelf.`);
  // A name that was withdrawn after a failed test run may be used again; its old versions stay on record.
  const last = existing
    ? await trx
        .selectFrom("tool_version")
        .select((eb) => eb.fn.max("version").as("version"))
        .where("tool_id", "=", existing.id)
        .executeTakeFirst()
    : undefined;
  const number = Number(last?.version ?? 0) + 1;

  const codePath = `${input.name}/v${number}`;
  const dest = path.join(lab.config.shelfDir, codePath);
  await cp(input.draftFolder, dest, { recursive: true });

  const tool = existing
    ? await trx
        .updateTable("tool")
        .set({
          description: input.description,
          kind: input.kind,
          created_by_monster_run_id: input.monsterRunId,
          created_for_process_id: input.processId,
        })
        .where("id", "=", existing.id)
        .returningAll()
        .executeTakeFirstOrThrow()
    : await trx
        .insertInto("tool")
        .values({
          name: input.name,
          description: input.description,
          kind: input.kind,
          created_by_monster_run_id: input.monsterRunId,
          created_for_process_id: input.processId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
  if (existing) await trx.deleteFrom("tool_site").where("tool_id", "=", existing.id).execute();
  const version = await trx
    .insertInto("tool_version")
    .values({
      tool_id: tool.id,
      version: number,
      code_path: codePath,
      origin_kind: "learn",
      monster_run_id: input.monsterRunId,
      became_current_at: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await trx.updateTable("tool").set({ current_version_id: version.id }).where("id", "=", tool.id).execute();
  for (const site of input.sites) {
    await trx.insertInto("tool_site").values({ tool_id: tool.id, site }).execute();
  }
  await trx
    .insertInto("monster_run_tool")
    .values({ monster_run_id: input.monsterRunId, tool_id: tool.id, origin: "made" })
    .execute();
  await recordAction(lab, trx, {
    monsterRunId: input.monsterRunId,
    kind: "create_tool",
    text: `Made a new tool: ${input.name}.`,
    toolName: input.name,
  });
  return { tool, version };
}

/**
 * No tool stays installed without a passing test run. When the lab's own run
 * of a learned chain fails, every tool that monster created is taken off the
 * shelf again. The records of what it wrote and of the failed run are kept.
 */
export async function withdrawCreatedTools(lab: Lab, monsterRunId: string): Promise<string[]> {
  const tools = await lab.db
    .selectFrom("tool")
    .select(["id", "name"])
    .where("created_by_monster_run_id", "=", monsterRunId)
    .where("current_version_id", "is not", null)
    .execute();
  if (tools.length === 0) return [];
  const ids = tools.map((tool) => tool.id);
  await lab.db.transaction().execute(async (trx) => {
    await trx.deleteFrom("process_step").where("tool_id", "in", ids).execute();
    await trx.updateTable("tool").set({ current_version_id: null }).where("id", "in", ids).execute();
  });
  for (const tool of tools) {
    await rm(path.join(lab.config.shelfDir, tool.name), { recursive: true, force: true });
  }
  return tools.map((tool) => tool.name);
}

export async function reuseTool(
  lab: Lab,
  trx: Trx,
  input: { processId: string; monsterRunId: string; name: string },
) {
  const tool = await trx.selectFrom("tool").selectAll().where("name", "=", input.name).executeTakeFirst();
  if (!tool || !tool.current_version_id) throw invalid("Nothing by that name exists on the shelf.");
  const sites = await trx.selectFrom("tool_site").select("site").where("tool_id", "=", tool.id).execute();
  const allowed = new Set(
    (await trx.selectFrom("process_site").select("site").where("process_id", "=", input.processId).execute()).map(
      (row) => row.site,
    ),
  );
  if (sites.some((row) => !allowed.has(row.site))) {
    throw invalid("That tool reaches a site this process may not use.");
  }
  await trx
    .insertInto("monster_run_tool")
    .values({ monster_run_id: input.monsterRunId, tool_id: tool.id, origin: "reused" })
    .onConflict((oc) => oc.columns(["monster_run_id", "tool_id"]).doNothing())
    .execute();
  await recordAction(lab, trx, {
    monsterRunId: input.monsterRunId,
    kind: "reuse_tool",
    text: `Reused ${input.name}.`,
    toolName: input.name,
  });
  return tool;
}

export async function saveChain(
  lab: Lab,
  trx: Trx,
  input: {
    processId: string;
    monsterRunId: string;
    tools: string[];
    check: { name: string; description: string };
  },
) {
  const owned = await trx
    .selectFrom("monster_run_tool")
    .innerJoin("tool", "tool.id", "monster_run_tool.tool_id")
    .select(["tool.id", "tool.name", "monster_run_tool.origin"])
    .where("monster_run_id", "=", input.monsterRunId)
    .execute();
  const byName = new Map(owned.map((row) => [row.name, row] as const));
  for (const name of input.tools) {
    if (!byName.has(name)) throw invalid("The chain names a tool this agent did not make or take into use.");
  }
  await trx.deleteFrom("process_step").where("process_id", "=", input.processId).execute();
  for (const [index, name] of input.tools.entries()) {
    const tool = byName.get(name)!;
    await trx
      .insertInto("process_step")
      .values({
        process_id: input.processId,
        position: index + 1,
        tool_id: tool.id,
        origin: tool.origin as ToolOrigin,
      })
      .execute();
  }
  await trx
    .updateTable("process")
    .set({ check_name: input.check.name, check_description: input.check.description })
    .where("id", "=", input.processId)
    .execute();
  await recordAction(lab, trx, {
    monsterRunId: input.monsterRunId,
    kind: "save_process",
    text: "Saved the process.",
  });
}

export async function appendExamples(
  trx: Trx,
  versionId: string,
  example: { input: Fact[]; result: Fact[] },
) {
  const row = await trx
    .selectFrom("tool_version")
    .select("examples")
    .where("id", "=", versionId)
    .executeTakeFirstOrThrow();
  const examples: unknown[] = Array.isArray(row.examples) ? Array.from(row.examples) : [];
  examples.push(example as unknown);
  await trx
    .updateTable("tool_version")
    .set({ examples: jsonb(examples) })
    .where("id", "=", versionId)
    .execute();
}

export function serveCodePath(shelfDir: string, repoRoot: string, relative: string): string {
  const repoShelf = path.join(repoRoot, "shelf");
  if (path.resolve(shelfDir) === path.resolve(repoShelf)) return path.posix.join("shelf", relative);
  return path.join(shelfDir, relative);
}
