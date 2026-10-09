import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { agentEnvironment, loadConfig } from "../config.ts";
import { Runner } from "../runner/runner.ts";
import type { Chain, Item, Login, RunResult, RunScope } from "../runner/types.ts";
import { readCurrentShelfVersion } from "../shelf/validator.ts";
import { makeRedactor } from "./actions.ts";
import { learn, repair, type MonsterOptions } from "./monster.ts";
import { installLocal } from "./shelf.ts";
import type { BriefSite, LearnBrief, RepairBrief, Tokens } from "./types.ts";
import { isRecord, parseProcess } from "./workspace.ts";

const usage = `Run one monster standalone: no HTTP service, no database.

  monster learn  --name <text> --description <text> --criterion <text>
                 --site <host | url | env:NAME> [--login [<site>=]<USER_ENV>,<PASS_ENV>]
                 [--item '<json>']... [--id <run id>]
  monster run    --process <saved process file> [--item '<json>']
  monster repair --process <saved process file> --item '<json>' [--id <run id>]

Logins are named by environment variable and read from the root .env; a login is never typed here.
The shelf is LAB_SHELF_DIR, the workspaces are under LAB_DATA_DIR, the model is LAB_MODEL.
Set LAB_HEADLESS=1 to hide the browser.`;

/** A learned process as the terminal command keeps it. Logins are stored as variable names only. */
interface SavedProcess {
  name: string;
  sites: Array<{ host: string; url?: string }>;
  connectors: string[];
  logins: Record<string, { usernameEnv: string; passwordEnv: string }>;
  steps: Chain["steps"];
  check: string;
  check_name: string;
  check_description: string;
  created: string[];
  reused: string[];
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  // The terminal command never opens the database; the setting only has to exist.
  const config = loadConfig({ databaseUrl: "postgres://unused" });
  const base = {
    shelfDir: config.shelfDir,
    model: config.model,
    env: agentEnvironment(config),
    timeoutMs: config.monsterTimeoutMs,
  };
  const id = one(args, "--id") ?? `${command}-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
  const workspace = path.join(config.dataDir, "workspaces", id);
  const processDir = path.join(config.dataDir, "processes");

  if (command === "learn") {
    const name = need(args, "--name");
    const { sites, loginNames } = readSites(many(args, "--site"), many(args, "--login"));
    const brief: LearnBrief = {
      kind: "learn",
      name,
      description: need(args, "--description"),
      successCriterion: need(args, "--criterion"),
      sites,
      connectors: [],
      examples: many(args, "--item").map((text) => asObject(text, "--item")),
    };
    const say = printer(sites);
    say(`Monster ${id} is learning. Workspace: ${workspace}`);
    const outcome = await learn(brief, { ...base, workspace, ...live(say) });
    const { findings } = outcome;

    say("");
    say(`Session: ${outcome.agentOk ? "ended normally" : `failed. ${outcome.error}`}`);
    say(`Took: ${duration(outcome.durationMs)}   ${tokenLine(outcome.tokens)}`);
    say(`Tools created: ${list(findings.created.map((tool) => tool.name))}`);
    say(`Tools reused: ${list(findings.reused)}`);
    if (findings.unusedDrafts.length > 0) say(`Drafts left out of the chain: ${list(findings.unusedDrafts)}`);
    if (findings.process) {
      say(`Chain: ${findings.process.steps.map((step) => `${step.id} (${step.tool})`).join(" -> ")}`);
      say(`Proof: ${findings.process.check}. ${findings.process.check_description}`);
    }
    for (const problem of findings.problems) say(`Problem: ${problem}`);
    if (!outcome.ok || !findings.process) {
      say(`Result: FAILED. ${outcome.error}`);
      process.exitCode = 1;
      return;
    }

    // From here the command stands in for the lab service: install, save, verify with the runner.
    for (const tool of findings.created) {
      const version = await installLocal(config.shelfDir, tool.folder, tool.name);
      say(`Installed ${tool.name} v${version} on the shelf.`);
    }
    const saved: SavedProcess = {
      name,
      sites: sites.map(({ host, url }) => ({ host, ...(url ? { url } : {}) })),
      connectors: [],
      logins: loginNames,
      ...findings.process,
      created: findings.created.map((tool) => tool.name),
      reused: findings.reused,
    };
    await mkdir(processDir, { recursive: true });
    const file = path.join(processDir, `${id}.json`);
    await writeFile(file, `${JSON.stringify(saved, null, 2)}\n`);
    say(`Saved the process: ${file}`);

    const runner = new Runner({ shelfDir: config.shelfDir });
    const scope = scopeOf(saved);
    const listed = await runner.listItems(saved, scope);
    if (listed.status !== "passed") {
      say(`Result: FAILED. The runner could not list the items. ${listed.error}`);
      process.exitCode = 1;
      return;
    }
    // A chain whose source step lists only the first example is still checked on the second.
    const second =
      listed.items[1] ?? (brief.examples[1] ? asItem(brief.examples[1], 1) : undefined);
    if (!second) {
      say("Result: NOT VERIFIED. There was no second example to check the work on.");
      process.exitCode = 1;
      return;
    }
    const run = await runner.runItem(saved, second, scope);
    printRun(say, second, run);
    say(`Result: ${run.status === "passed" ? "VERIFIED" : "FAILED"}. The saved chain ran on the second example with ${run.modelCalls} model calls.`);
    if (run.status !== "passed") process.exitCode = 1;
    return;
  }

  if (command === "run") {
    const saved = await readSaved(need(args, "--process"));
    const say = printer(sitesOf(saved));
    const runner = new Runner({ shelfDir: config.shelfDir });
    const scope = scopeOf(saved);
    let items: Item[];
    const given = many(args, "--item");
    if (given.length > 0) {
      items = given.map((text, index) => asItem(asObject(text, "--item"), index));
    } else {
      const listed = await runner.listItems(saved, scope);
      if (listed.status !== "passed") throw new Error(`The runner could not list the items. ${listed.error}`);
      items = listed.items;
    }
    for (const item of items) {
      const run = await runner.runItem(saved, item, scope);
      printRun(say, item, run);
      if (run.status !== "passed") process.exitCode = 1;
    }
    return;
  }

  if (command === "repair") {
    const saved = await readSaved(need(args, "--process"));
    const sites = sitesOf(saved);
    const say = printer(sites);
    const item = asItem(asObject(need(args, "--item"), "--item"), 0);
    const runner = new Runner({ shelfDir: config.shelfDir });
    const scope = scopeOf(saved);

    const before = await runner.runItem(saved, item, scope);
    printRun(say, item, before);
    const failed = before.failedStep === null ? undefined : before.steps[before.failedStep - 1];
    if (before.status !== "failed" || !failed) {
      say(before.status === "passed" ? "The chain passed. There is nothing to repair." : "The run did not fail at a tool, so no repair starts.");
      return;
    }
    const current = await readCurrentShelfVersion(config.shelfDir, failed.tool);
    const brief: RepairBrief = {
      kind: "repair",
      tool: failed.tool,
      failedStep: failed.id ?? saved.steps[before.failedStep!]?.id ?? failed.tool,
      error: failed.error ?? before.error ?? "The tool failed.",
      failingInput: failed.input,
      code: await readFile(current.codePath, "utf8"),
      meta: current.meta,
      examples: [],
      pastRepairs: [],
      sites,
      connectors: saved.connectors,
      chain: { steps: saved.steps, check: saved.check },
      item,
    };
    say(`Monster ${id} is repairing ${failed.tool} v${current.version}. Workspace: ${workspace}`);
    const outcome = await repair(brief, { ...base, workspace, ...live(say) });
    say("");
    say(`Session: ${outcome.agentOk ? "ended normally" : `failed. ${outcome.error}`}`);
    say(`Took: ${duration(outcome.durationMs)}   ${tokenLine(outcome.tokens)}`);
    const { findings } = outcome;
    if (findings.outcome === "failed") {
      for (const problem of findings.problems) say(`Problem: ${problem}`);
      say("Result: NOT FIXED.");
      process.exitCode = 1;
      return;
    }
    if (findings.outcome === "gave_up") {
      say(`Result: NOT FIXED. The monster says it cannot be fixed: ${findings.reason}`);
      process.exitCode = 1;
      return;
    }
    say(`What changed: ${findings.whatChanged}`);
    const version = await installLocal(config.shelfDir, findings.folder, failed.tool);
    say(`Installed ${failed.tool} v${version} on the shelf as the candidate.`);
    const after = await runner.runItem(saved, item, scope);
    printRun(say, item, after);
    say(`Result: ${after.status === "passed" ? "FIXED" : "NOT FIXED"}. The failed item was run again with ${after.modelCalls} model calls.`);
    if (after.status !== "passed") process.exitCode = 1;
    return;
  }

  throw new Error(usage);
}

function live(say: (line: string) => void): Pick<MonsterOptions, "onAction" | "onTokens"> {
  return { onAction: (action) => say(`  - ${action.text}`) };
}

function printRun(say: (line: string) => void, item: Item, run: RunResult): void {
  say(`Run of "${item.label}": ${run.status}, ${run.modelCalls} model calls.`);
  for (const step of run.steps) {
    say(`  ${step.status.padEnd(7)} ${step.tool} v${step.version} (${duration(step.durationMs)})${step.error ? `  ${step.error}` : ""}`);
  }
  if (run.proofValue !== null) say(`  proof: ${run.proofValue}`);
  else if (run.error) say(`  error: ${run.error}`);
}

/** Every line this command prints passes through the redactor first. */
function printer(sites: BriefSite[]): (line: string) => void {
  const redact = makeRedactor(sites.flatMap((site) => (site.login ? [site.login] : [])));
  return (line) => process.stdout.write(`${redact(line)}\n`);
}

function readSites(siteArgs: string[], loginArgs: string[]) {
  if (siteArgs.length === 0) throw new Error(usage);
  const sites: BriefSite[] = siteArgs.map((arg) => {
    const { host, url } = parseSite(arg);
    return { host, ...(url ? { url } : {}) };
  });
  const loginNames: SavedProcess["logins"] = {};
  for (const arg of loginArgs) {
    const [left, right] = arg.includes("=") ? arg.split("=", 2) : [undefined, arg];
    const host = left ? parseSite(left).host : sites[0]!.host;
    const [usernameEnv, passwordEnv] = (right ?? "").split(",");
    const site = sites.find((entry) => entry.host === host);
    if (!site || !usernameEnv || !passwordEnv) throw new Error(usage);
    site.login = readLogin(usernameEnv, passwordEnv);
    loginNames[host] = { usernameEnv, passwordEnv };
  }
  return { sites, loginNames };
}

function parseSite(arg: string): { host: string; url?: string } {
  let value = arg;
  if (arg.startsWith("env:")) {
    value = process.env[arg.slice(4)] ?? "";
    if (!value) throw new Error(`${arg.slice(4)} is not set.`);
  }
  if (value.includes("://")) {
    const url = new URL(value);
    return { host: url.hostname.toLowerCase(), url: url.toString() };
  }
  return { host: value.toLowerCase() };
}

function readLogin(usernameEnv: string, passwordEnv: string): Login {
  const username = process.env[usernameEnv];
  const password = process.env[passwordEnv];
  if (!username || !password) throw new Error(`${usernameEnv} or ${passwordEnv} is not set.`);
  return { username, password };
}

async function readSaved(file: string): Promise<SavedProcess> {
  const raw = JSON.parse(await readFile(path.resolve(process.env.INIT_CWD ?? ".", file), "utf8")) as SavedProcess;
  return { ...raw, ...parseProcess(raw) };
}

function sitesOf(saved: SavedProcess): BriefSite[] {
  return saved.sites.map((site) => {
    const names = saved.logins[site.host];
    return { ...site, ...(names ? { login: readLogin(names.usernameEnv, names.passwordEnv) } : {}) };
  });
}

function scopeOf(saved: SavedProcess): RunScope {
  const scope = { sites: saved.sites.map((site) => site.host), connectors: saved.connectors };
  const logins: Record<string, Login> = {};
  for (const site of sitesOf(saved)) if (site.login) logins[site.host] = site.login;
  return { invitation: scope, process: scope, logins };
}

function asObject(text: string, flag: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${flag} needs one JSON object.`);
  }
  if (!isRecord(value)) throw new Error(`${flag} needs one JSON object.`);
  return value;
}

function asItem(value: Record<string, unknown>, index: number): Item {
  if (typeof value.id === "string" && typeof value.label === "string" && isRecord(value.data)) {
    return { id: value.id, label: value.label, data: value.data };
  }
  const label = Object.values(value).filter((entry) => typeof entry === "string").slice(0, 2).join(" ");
  return { id: `given-${index + 1}`, label: label || `item ${index + 1}`, data: value };
}

function one(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function need(args: string[], name: string): string {
  const value = one(args, name);
  if (!value) throw new Error(usage);
  return value;
}

function many(args: string[], name: string): string[] {
  return args.flatMap((arg, index) => (arg === name && args[index + 1] !== undefined ? [args[index + 1]!] : []));
}

function list(names: string[]): string {
  return names.length > 0 ? names.join(", ") : "none";
}

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function tokenLine(tokens: Tokens): string {
  return `Tokens: ${tokens.input} in, ${tokens.output} out, ${tokens.cached} cached.`;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
