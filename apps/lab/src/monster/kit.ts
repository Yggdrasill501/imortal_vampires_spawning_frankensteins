import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Runner } from "../runner/runner.ts";
import type { Chain, Item, RunScope } from "../runner/types.ts";
import { checkToolVersion, readCurrentShelfVersion } from "../shelf/validator.ts";
import { listShelf, searchShelf } from "./shelf.ts";
import { WORKSPACE_FILES, type KitContext, type ShelfEntry } from "./types.ts";
import { draftFolder, isRecord, listDrafts, readProcessFile } from "./workspace.ts";

/**
 * The starting kit: everything a monster can do at birth besides writing
 * files and using its browser. Nothing here knows any site, form or process.
 *
 *   ./kit shelf                              list every tool on the shelf
 *   ./kit search <words>                     the same list, filtered by words
 *   ./kit test <tool> '<input json>'         run one draft or shelf tool on one input
 *   ./kit chain ['<item json>'] [--until id] run the draft chain on one item
 */

const contextPath = (workspace: string) =>
  path.join(workspace, WORKSPACE_FILES.kitDir, "context.json");

/** Puts the kit command and its context into a fresh workspace. */
export async function prepareKit(workspace: string, context: KitContext): Promise<void> {
  await mkdir(path.join(workspace, WORKSPACE_FILES.kitDir), { recursive: true });
  await mkdir(path.join(workspace, WORKSPACE_FILES.tools), { recursive: true });
  await writeFile(contextPath(workspace), `${JSON.stringify(context, null, 2)}\n`, { mode: 0o600 });
  await chmod(contextPath(workspace), 0o600);
  const tsx = createRequire(import.meta.url).resolve("tsx/cli");
  const entry = fileURLToPath(new URL("./kit-cli.ts", import.meta.url));
  const script = [
    "#!/bin/sh",
    `exec ${quote(process.execPath)} ${quote(tsx)} ${quote(entry)} --workspace ${quote(workspace)} "$@"`,
    "",
  ].join("\n");
  const target = path.join(workspace, WORKSPACE_FILES.kit);
  await writeFile(target, script, { mode: 0o755 });
  await chmod(target, 0o755);
}

/** Removes the logins from a finished workspace. The rest is kept for inspection. */
export async function sealKit(workspace: string): Promise<void> {
  try {
    const context = await readContext(workspace);
    await writeFile(
      contextPath(workspace),
      `${JSON.stringify({ ...context, logins: {}, mail: null }, null, 2)}\n`,
      { mode: 0o600 },
    );
  } catch {
    // No kit was prepared.
  }
  await rm(path.join(workspace, WORKSPACE_FILES.kitDir, "stage"), { recursive: true, force: true });
}

export async function readContext(workspace: string): Promise<KitContext> {
  return JSON.parse(await readFile(contextPath(workspace), "utf8")) as KitContext;
}

interface Stage {
  dir: string;
  versions: Map<string, number>;
  drafts: Set<string>;
  problems: string[];
}

/**
 * The existing runner reads tools only from a shelf layout. The kit gives it
 * a throwaway one: the real shelf's current versions plus this workspace's
 * drafts. The real shelf is never written.
 */
async function buildStage(workspace: string, context: KitContext): Promise<Stage> {
  const dir = path.join(workspace, WORKSPACE_FILES.kitDir, "stage");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const versions = new Map<string, number>();
  const drafts = new Set<string>();
  const problems: string[] = [];

  for (const entry of await listShelf(context.shelfDir)) {
    const current = await readCurrentShelfVersion(context.shelfDir, entry.name);
    await cp(current.folder, path.join(dir, entry.name, `v${current.version}`), { recursive: true });
    versions.set(entry.name, current.version);
  }

  const passwords = Object.values(context.logins).map((login) => login.password);
  for (const name of await listDrafts(workspace)) {
    const folder = draftFolder(workspace, name);
    const onShelf = versions.get(name);
    const beingRepaired = context.mode === "repair" && context.repairTool === name;
    if (onShelf !== undefined && !beingRepaired) {
      problems.push(`${name} is already on the shelf. Use the shelf tool; do not write it again.`);
      continue;
    }
    if (context.mode === "repair" && !beingRepaired) {
      problems.push(`${name} is not the tool under repair. Change only ${context.repairTool}.`);
      continue;
    }
    const check = await checkToolVersion(
      folder,
      { sites: context.sites, connectors: context.connectors },
      passwords,
    );
    if (!check.passed) {
      problems.push(`${name} fails the install check: ${check.issues.map((issue) => issue.message).join(" ")}`);
      continue;
    }
    const version = (onShelf ?? 0) + 1;
    await cp(folder, path.join(dir, name, `v${version}`), { recursive: true });
    versions.set(name, version);
    drafts.add(name);
  }
  return { dir, versions, drafts, problems };
}

function scopeOf(context: KitContext): RunScope {
  const scope = { sites: context.sites, connectors: context.connectors };
  return { invitation: scope, process: scope, logins: context.logins };
}

function view(entry: ShelfEntry) {
  return {
    name: entry.name,
    description: entry.description,
    sites: entry.sites,
    connectors: entry.connectors,
    effect: entry.effect,
    lists_items: entry.lists_items,
    input: entry.input,
    output: entry.output,
  };
}

export async function kitShelf(workspace: string, words: string[] = []): Promise<unknown> {
  const context = await readContext(workspace);
  const all = await listShelf(context.shelfDir);
  const tools = words.length > 0 ? searchShelf(all, words) : all;
  return { tools: tools.map(view), count: tools.length, on_shelf: all.length };
}

export async function kitTest(workspace: string, name: string, input: unknown): Promise<unknown> {
  if (!isRecord(input)) throw new Error("The input must be one JSON object.");
  const context = await readContext(workspace);
  const stage = await buildStage(workspace, context);
  const version = stage.versions.get(name);
  if (version === undefined) {
    return {
      status: "failed",
      error: stage.problems.find((problem) => problem.startsWith(`${name} `)) ??
        `There is no tool named ${name} in tools/ or on the shelf.`,
    };
  }
  const runner = new Runner({ shelfDir: stage.dir, headless: context.headless, mail: context.mail ?? null });
  const result = await runner.replayTool(name, version, input, scopeOf(context));
  return {
    tool: name,
    from: stage.drafts.has(name) ? "draft" : "shelf",
    status: result.status,
    result: result.result,
    error: result.error,
    logs: result.logs,
    refused: result.refusals.map((refusal) => refusal.url),
    model_calls: result.modelCalls,
  };
}

export async function kitChain(
  workspace: string,
  options: { item?: unknown; until?: string },
): Promise<unknown> {
  const context = await readContext(workspace);
  const file = await readProcessFile(workspace);
  const stage = await buildStage(workspace, context);
  const named = new Set(file.steps.map((step) => step.tool));
  const problems = stage.problems.filter((problem) => named.has(problem.split(" ", 1)[0] ?? ""));
  if (problems.length > 0) return { status: "failed", error: problems.join(" ") };

  let chain: Chain = { steps: file.steps, check: file.check };
  let partial = false;
  if (options.until) {
    const last = file.steps.findIndex((step) => step.id === options.until);
    if (last === -1) throw new Error(`process.json has no step with the id ${options.until}.`);
    partial = last < file.steps.length - 1;
    chain = { steps: file.steps.slice(0, last + 1), check: file.check };
  }

  const runner = new Runner({ shelfDir: stage.dir, headless: context.headless, mail: context.mail ?? null });
  const scope = scopeOf(context);
  let item: Item;
  let listed: unknown;
  if (options.item !== undefined) {
    item = asItem(options.item);
  } else {
    const list = await runner.listItems(chain, scope);
    if (list.status !== "passed") {
      return { status: list.status, stage: "list items", tool: list.tool, error: list.error, logs: list.logs };
    }
    const first = list.items[0];
    if (!first) return { status: "failed", stage: "list items", error: "The source tool returned no items." };
    item = first;
    listed = list.items.map((entry) => ({ id: entry.id, label: entry.label }));
  }

  const run = await runner.runItem(chain, item, scope);
  const proofSkipped = partial && run.failedStep === null && run.status !== "passed";
  return {
    status: proofSkipped ? "passed" : run.status,
    ...(partial ? { note: `Stopped after ${options.until}. The proof was not checked.` } : {}),
    ...(listed ? { listed } : {}),
    item,
    steps: run.steps.map((step, index) => ({
      id: step.id ?? chain.steps[index + 1]?.id,
      tool: step.tool,
      status: step.status,
      result: step.result,
      error: step.error,
      logs: step.logs,
    })),
    proof: run.proofValue,
    error: proofSkipped ? null : run.error,
    refused: run.refusals.map((refusal) => refusal.url),
    model_calls: run.modelCalls,
  };
}

function asItem(value: unknown): Item {
  if (!isRecord(value)) throw new Error("The item must be one JSON object.");
  if (typeof value.id === "string" && typeof value.label === "string" && isRecord(value.data)) {
    return { id: value.id, label: value.label, data: value.data };
  }
  return { id: "example", label: "example", data: value };
}

function quote(text: string): string {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}
