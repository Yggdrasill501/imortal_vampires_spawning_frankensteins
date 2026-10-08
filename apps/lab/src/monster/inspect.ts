import { readFile } from "node:fs/promises";
import path from "node:path";
import { checkToolVersion, readCurrentShelfVersion } from "../shelf/validator.ts";
import type { ToolMeta } from "../shelf/types.ts";
import { WORKSPACE_FILES, type ProcessFile, type RepairBrief } from "./types.ts";
import { draftFolder, isRecord, listDrafts, readJson, readProcessFile } from "./workspace.ts";

/**
 * What the lab finds in a workspace after a session. The agent's own account
 * of what it did is never an input here: only the files are.
 */

export interface Access {
  shelfDir: string;
  sites: string[];
  connectors: string[];
  passwords: string[];
}

export interface LearnFindings {
  ok: boolean;
  /** One sentence per problem. Empty when ok. */
  problems: string[];
  process: ProcessFile | null;
  created: Array<{ name: string; folder: string; meta: ToolMeta }>;
  reused: string[];
  unusedDrafts: string[];
}

export async function inspectLearn(workspace: string, access: Access): Promise<LearnFindings> {
  const findings: LearnFindings = {
    ok: false,
    problems: [],
    process: null,
    created: [],
    reused: [],
    unusedDrafts: [],
  };
  const drafts = await listDrafts(workspace);
  let file: ProcessFile;
  try {
    file = await readProcessFile(workspace);
  } catch (error) {
    findings.problems.push(sentence(error));
    findings.unusedDrafts = drafts;
    return findings;
  }
  findings.process = file;

  const metas = new Map<string, ToolMeta>();
  for (const name of new Set(file.steps.map((step) => step.tool))) {
    let shelfMeta: ToolMeta | null = null;
    try {
      shelfMeta = (await readCurrentShelfVersion(access.shelfDir, name)).meta;
    } catch {
      // Not on the shelf.
    }
    const drafted = drafts.includes(name);
    if (shelfMeta && drafted) {
      findings.problems.push(`The agent wrote ${name} again although it is already on the shelf.`);
      continue;
    }
    if (shelfMeta) {
      const outside = shelfMeta.sites.find((site) => !includes(access.sites, site));
      if (outside) {
        findings.problems.push(`The shelf tool ${name} reaches a site outside this process: ${outside}.`);
        continue;
      }
      metas.set(name, shelfMeta);
      findings.reused.push(name);
      continue;
    }
    if (!drafted) {
      findings.problems.push(`The chain names an unknown tool: ${name}.`);
      continue;
    }
    const folder = draftFolder(workspace, name);
    const check = await checkToolVersion(
      folder,
      { sites: access.sites, connectors: access.connectors },
      access.passwords,
    );
    if (!check.passed || !check.tool) {
      findings.problems.push(
        `The tool ${name} fails the install check: ${check.issues.map((issue) => issue.message).join(" ")}`,
      );
      continue;
    }
    metas.set(name, check.tool.meta);
    findings.created.push({ name, folder, meta: check.tool.meta });
  }
  findings.unusedDrafts = drafts.filter((name) => !file.steps.some((step) => step.tool === name));

  if (findings.problems.length === 0) findings.problems.push(...chainProblems(file, metas));
  findings.ok = findings.problems.length === 0;
  return findings;
}

/** The same shape checks the runner makes, done early so the sentence names the step. */
function chainProblems(file: ProcessFile, metas: Map<string, ToolMeta>): string[] {
  const problems: string[] = [];
  const outputs = new Map<string, Set<string>>();
  const reference = (value: string, where: string) => {
    const step = /^\$steps\.([a-z][a-z0-9_]*)\.([a-zA-Z_][\w-]*)$/.exec(value);
    if (step) {
      const fields = outputs.get(step[1]!);
      if (!fields) problems.push(`${where} refers to ${step[1]}, which is not an earlier step.`);
      else if (!fields.has(step[2]!)) problems.push(`${where} refers to ${value}, which that step does not return.`);
      return;
    }
    if (!/^\$item\.[a-zA-Z_][\w-]*$/.test(value)) problems.push(`${where} holds a reference that is not valid: ${value}.`);
  };
  const walk = (value: unknown, where: string) => {
    if (typeof value === "string" && value.startsWith("$")) reference(value, where);
    else if (Array.isArray(value)) value.forEach((entry) => walk(entry, where));
    else if (isRecord(value)) Object.values(value).forEach((entry) => walk(entry, where));
  };

  for (const [index, step] of file.steps.entries()) {
    const meta = metas.get(step.tool)!;
    if (index === 0 && !meta.lists_items) problems.push(`The first step must list the incoming items, and ${step.tool} does not.`);
    if (index > 0 && meta.lists_items) problems.push(`Only the first step may list items, and step ${step.id} does too.`);
    const expected = Object.keys(meta.input).sort().join(",");
    if (Object.keys(step.input).sort().join(",") !== expected) {
      problems.push(`Step ${step.id} does not give ${step.tool} exactly its input fields.`);
    }
    // The source step runs before any item exists, so it may hold literals that look like item data.
    if (index > 0) walk(step.input, `Step ${step.id}`);
    outputs.set(step.id, new Set(Object.keys(meta.output)));
  }
  reference(file.check, "The proof");
  return problems;
}

export type RepairFindings =
  | { outcome: "repaired"; whatChanged: string; folder: string }
  | { outcome: "gave_up"; reason: string }
  | { outcome: "failed"; problems: string[] };

export async function inspectRepair(
  workspace: string,
  brief: RepairBrief,
  access: Access,
): Promise<RepairFindings> {
  let repair: unknown;
  let giveUp: unknown;
  try {
    repair = await readJson(path.join(workspace, WORKSPACE_FILES.repair));
    giveUp = await readJson(path.join(workspace, WORKSPACE_FILES.giveUp));
  } catch (error) {
    return { outcome: "failed", problems: [sentence(error)] };
  }
  if (repair !== undefined && giveUp !== undefined) {
    return { outcome: "failed", problems: ["The agent wrote both repair.json and give_up.json."] };
  }
  if (giveUp !== undefined) {
    if (!isRecord(giveUp) || typeof giveUp.reason !== "string" || !giveUp.reason.trim()) {
      return { outcome: "failed", problems: ["give_up.json does not say why."] };
    }
    return { outcome: "gave_up", reason: giveUp.reason.trim() };
  }
  if (repair === undefined) {
    return { outcome: "failed", problems: ["Neither repair.json nor give_up.json is in the workspace."] };
  }
  if (!isRecord(repair) || typeof repair.what_changed !== "string" || !repair.what_changed.trim()) {
    return { outcome: "failed", problems: ["repair.json does not say what changed."] };
  }

  const problems: string[] = [];
  const others = (await listDrafts(workspace)).filter((name) => name !== brief.tool);
  if (others.length > 0) problems.push(`The agent wrote tools it was not sent to repair: ${others.join(", ")}.`);

  const folder = draftFolder(workspace, brief.tool);
  const check = await checkToolVersion(
    folder,
    { sites: access.sites, connectors: access.connectors },
    access.passwords,
  );
  if (!check.passed || !check.tool) {
    problems.push(`The repaired tool fails the install check: ${check.issues.map((issue) => issue.message).join(" ")}`);
    return { outcome: "failed", problems };
  }
  const meta = check.tool.meta;
  if (!sameKeys(meta.input, brief.meta.input)) problems.push("The repair changed the tool's input fields.");
  if (!sameKeys(meta.output, brief.meta.output)) problems.push("The repair changed the tool's output fields.");
  if (meta.lists_items !== brief.meta.lists_items) problems.push("The repair changed whether the tool lists items.");
  const outside = meta.sites.find((site) => !includes(brief.meta.sites, site));
  if (outside) problems.push(`The repair made the tool reach a new site: ${outside}.`);
  const code = await readFile(check.tool.codePath, "utf8");
  if (code.trim() === brief.code.trim()) problems.push("repair.json claims a change, but the tool's code is unchanged.");

  if (problems.length > 0) return { outcome: "failed", problems };
  return { outcome: "repaired", whatChanged: repair.what_changed.trim(), folder };
}

function sameKeys(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return Object.keys(a).sort().join(",") === Object.keys(b).sort().join(",");
}

function includes(sites: readonly string[], site: string): boolean {
  return sites.some((entry) => entry.toLowerCase() === site.toLowerCase());
}

function sentence(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
