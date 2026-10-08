import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type {
  InstallCheck,
  InstallIssue,
  InvitationScope,
  ToolMeta,
  ToolVersion,
} from "./types.ts";

const TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const VERSION_FOLDER = /^v([1-9][0-9]*)$/;
const SITE_NAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}$/i;
const CONNECTOR_NAME = /^[a-z][a-z0-9_-]{0,63}$/;
const DEFAULT_EXPORT = /\bexport\s+default\s+(?:async\s+)?(?:function\b|[A-Za-z_$][\w$]*\b|\()/;

const FORBIDDEN_CODE: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bimport\b/, "imports"],
  [/\brequire\b/, "require"],
  [/\bprocess\b/, "process access"],
  [/\beval\b/, "eval"],
  [/\bnew\s+Function\b/, "new Function"],
  [/\bfetch\b/, "fetch"],
  [/\bWebSocket\b/, "web sockets"],
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringMap(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (description) =>
        typeof description === "string" && description.trim().length > 0,
    )
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function parseMeta(value: unknown, folderName: string): ToolMeta | null {
  const expectedKeys = [
    "name",
    "description",
    "sites",
    "connectors",
    "effect",
    "lists_items",
    "input",
    "output",
  ];
  if (!isRecord(value) || !hasOnlyKeys(value, expectedKeys)) return null;
  if (
    typeof value.name !== "string" ||
    value.name !== folderName ||
    !TOOL_NAME.test(value.name) ||
    typeof value.description !== "string" ||
    value.description.trim().length === 0 ||
    !isStringArray(value.sites) ||
    !isStringArray(value.connectors) ||
    (value.effect !== "reads" && value.effect !== "writes") ||
    typeof value.lists_items !== "boolean" ||
    !isStringMap(value.input) ||
    !isStringMap(value.output)
  ) {
    return null;
  }
  if (
    new Set(value.sites).size !== value.sites.length ||
    new Set(value.connectors).size !== value.connectors.length ||
    !value.sites.every((site) => SITE_NAME.test(site)) ||
    !value.connectors.every((connector) => CONNECTOR_NAME.test(connector))
  ) {
    return null;
  }
  return {
    name: value.name,
    description: value.description.trim(),
    sites: value.sites,
    connectors: value.connectors,
    effect: value.effect,
    lists_items: value.lists_items,
    input: value.input,
    output: value.output,
  };
}

async function readToolDirectory(
  folder: string,
  name: string,
  version: number,
): Promise<ToolVersion> {
  const directory = await lstat(folder);
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    throw new Error("A tool version must be a real directory.");
  }

  const files = await readdir(folder);
  if (!hasOnlyKeys(Object.fromEntries(files.map((file) => [file, true])), ["meta.json", "tool.mjs"])) {
    throw new Error("A tool version must contain only meta.json and tool.mjs.");
  }

  const [metaStat, codeStat] = await Promise.all([
    lstat(path.join(folder, "meta.json")),
    lstat(path.join(folder, "tool.mjs")),
  ]);
  if (!metaStat.isFile() || metaStat.isSymbolicLink() || !codeStat.isFile() || codeStat.isSymbolicLink()) {
    throw new Error("A tool version must contain regular meta.json and tool.mjs files.");
  }

  let rawMeta: unknown;
  try {
    rawMeta = JSON.parse(await readFile(path.join(folder, "meta.json"), "utf8"));
  } catch {
    throw new Error("The tool meta.json is not valid JSON.");
  }
  const meta = parseMeta(rawMeta, name);
  if (!meta) {
    throw new Error("The tool meta.json does not match the tool contract.");
  }

  return {
    name,
    version,
    folder: path.resolve(folder),
    codePath: path.resolve(folder, "tool.mjs"),
    meta,
  };
}

/** Reads an immutable installed version at shelf/<tool name>/v<n>/. */
export async function readToolVersion(folder: string): Promise<ToolVersion> {
  const name = path.basename(path.dirname(folder));
  const match = VERSION_FOLDER.exec(path.basename(folder));
  if (!TOOL_NAME.test(name) || !match?.[1]) {
    throw new Error("A tool version must be stored as <tool name>/v<version>.");
  }
  return readToolDirectory(folder, name, Number(match[1]));
}

/**
 * Monsters write drafts as tools/<tool name>/{meta.json,tool.mjs}. A draft is
 * checked before the shelf-index copies it into its immutable v<n> folder.
 */
export async function readToolDraft(folder: string): Promise<ToolVersion> {
  const name = path.basename(folder);
  if (!TOOL_NAME.test(name)) {
    throw new Error("A tool draft folder must be named after its tool.");
  }
  return readToolDirectory(folder, name, 0);
}

/** Resolves one explicit version. The service will call this for pinned run steps. */
export async function readShelfVersion(
  shelfDir: string,
  name: string,
  version: number,
): Promise<ToolVersion> {
  if (!TOOL_NAME.test(name) || !Number.isSafeInteger(version) || version < 1) {
    throw new Error("The tool name or version is invalid.");
  }
  return readToolVersion(path.join(shelfDir, name, `v${version}`));
}

/** Returns the newest installed version, which is the normal saved-chain behaviour. */
export async function readCurrentShelfVersion(
  shelfDir: string,
  name: string,
): Promise<ToolVersion> {
  if (!TOOL_NAME.test(name)) throw new Error("The tool name is invalid.");
  const toolFolder = path.join(shelfDir, name);
  const entries = await readdir(toolFolder, { withFileTypes: true });
  const versions = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => VERSION_FOLDER.exec(entry.name)?.[1])
    .filter((version): version is string => version !== undefined)
    .map(Number);
  const current = Math.max(...versions);
  if (!Number.isFinite(current)) throw new Error("The tool has no installed version.");
  return readShelfVersion(shelfDir, name, current);
}

function scanCode(code: string, heldSecrets: readonly string[]): InstallIssue[] {
  const issues: InstallIssue[] = [];
  if (code.length > 20_000) {
    issues.push({ message: "The tool code is longer than 20,000 characters." });
  }
  if (!DEFAULT_EXPORT.test(code)) {
    issues.push({ message: "The tool must have one default function export." });
  }
  for (const [pattern, name] of FORBIDDEN_CODE) {
    if (pattern.test(code)) {
      issues.push({ message: `The tool code may not use ${name}.` });
    }
  }
  for (const secret of heldSecrets) {
    if (secret.length > 0 && code.includes(secret)) {
      issues.push({ message: "The tool code contains a held password." });
      break;
    }
  }
  return issues;
}

/**
 * The install check is deliberately a filter, not a sandbox. The runner's
 * browser guard is still the boundary that applies during every saved run.
 */
export async function checkToolVersion(
  folder: string,
  invitation: InvitationScope,
  heldSecrets: readonly string[] = [],
  layout: "draft" | "installed" = "draft",
): Promise<InstallCheck> {
  let tool: ToolVersion;
  try {
    tool =
      layout === "installed"
        ? await readToolVersion(folder)
        : await readToolDraft(folder);
  } catch (error) {
    return {
      passed: false,
      tool: null,
      issues: [{ message: firstLine(error) }],
    };
  }

  const issues = scanCode(await readFile(tool.codePath, "utf8"), heldSecrets);
  const invitedSites = new Set(invitation.sites.map((site) => site.toLowerCase()));
  const invitedConnectors = new Set(invitation.connectors);
  for (const site of tool.meta.sites) {
    if (!invitedSites.has(site.toLowerCase())) {
      issues.push({ message: `The tool names an uninvited site: ${site}.`, site });
    }
  }
  for (const connector of tool.meta.connectors) {
    if (!invitedConnectors.has(connector)) {
      issues.push({
        message: `The tool names an uninvited connector: ${connector}.`,
        connector,
      });
    }
  }
  return { passed: issues.length === 0, tool, issues };
}

export function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(/\r?\n/, 1)[0] || "The tool failed without an error message.";
}
