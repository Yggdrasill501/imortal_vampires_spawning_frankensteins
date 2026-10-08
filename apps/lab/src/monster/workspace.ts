import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { WORKSPACE_FILES, type ProcessFile } from "./types.ts";

const STEP_ID = /^[a-z][a-z0-9_]{0,63}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function readJson(file: string): Promise<unknown | undefined> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${path.basename(file)} is not valid JSON.`);
  }
}

/** Names of the draft folders under <workspace>/tools. */
export async function listDrafts(workspace: string): Promise<string[]> {
  try {
    return (await readdir(path.join(workspace, WORKSPACE_FILES.tools), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function draftFolder(workspace: string, name: string): string {
  return path.join(workspace, WORKSPACE_FILES.tools, name);
}

/** Reads and shape-checks process.json. Throws one sentence when it is missing or malformed. */
export async function readProcessFile(workspace: string): Promise<ProcessFile> {
  const raw = await readJson(path.join(workspace, WORKSPACE_FILES.process));
  if (raw === undefined) throw new Error("process.json is missing from the workspace.");
  return parseProcess(raw);
}

export function parseProcess(raw: unknown): ProcessFile {
  if (!isRecord(raw) || !Array.isArray(raw.steps) || raw.steps.length === 0) {
    throw new Error("process.json needs a steps list.");
  }
  const ids = new Set<string>();
  const steps = raw.steps.map((step) => {
    if (
      !isRecord(step) ||
      typeof step.id !== "string" ||
      !STEP_ID.test(step.id) ||
      ids.has(step.id) ||
      typeof step.tool !== "string" ||
      !isRecord(step.input)
    ) {
      throw new Error("Every step in process.json needs a unique lower-case id, a tool and an input object.");
    }
    ids.add(step.id);
    return { id: step.id, tool: step.tool, input: step.input };
  });
  if (typeof raw.check !== "string" || !raw.check.startsWith("$")) {
    throw new Error("process.json needs a check that is a reference.");
  }
  if (
    typeof raw.check_name !== "string" ||
    !raw.check_name.trim() ||
    typeof raw.check_description !== "string" ||
    !raw.check_description.trim()
  ) {
    throw new Error("process.json needs a check_name and a check_description.");
  }
  return {
    steps,
    check: raw.check,
    check_name: raw.check_name.trim(),
    check_description: raw.check_description.trim(),
  };
}
